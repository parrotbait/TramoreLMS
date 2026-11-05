// Created by Claude driven by Eddie Long on 2026-11-02.
//
// Entering, paying and buying back, against the database (Decision 18).
//
//   startEntry       form → pending entry with a 1-hour name hold → Checkout
//   beginCheckout    a Checkout session for an entry fee or a buy-back
//   confirmPayment   the webhook: record the payment, make the entry active
//                    (or apply the buy-back), then email a sign-in link
//   failCheckout     the webhook: an abandoned or failed Checkout
//   expireHolds      the tick: free names whose hold ran out

import { and, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm'

import { createLink, findPersonById } from '@/auth/store'
import { hashToken, newToken } from '@/auth/tokens'
import type { Database } from '@/db/client'
import { toGameState } from '@/db/game-state'
import { loadCompetitionRows } from '@/db/load'
import type { Executor } from '@/db/load'
import { alerts, competitions, entries, payments, people, weeks } from '@/db/schema'
import type { Mailer } from '@/email/mailer'
import { welcomeEmail } from '@/email/templates'
import { areEntriesOpen, isBuybackWindowOpen } from '@/engine'
import { displayNameKey } from '@/lib/display-name'

import { decideActivation } from './activation'
import type { ActivationAlert, PaymentKind } from './activation'
import { holdExpiresAt, validateEntryForm } from './entry-rules'
import type { EntryFieldError } from './entry-rules'
import type { PaymentGateway } from './stripe'
import { commandFromSession } from './webhook-events'
import type { WebhookCommand } from './webhook-events'

const HOUR_MS = 60 * 60 * 1000
const WELCOME_LINK_TTL_MS = 24 * HOUR_MS

export interface PaymentEnvironment {
    readonly db: Database
    readonly gateway: PaymentGateway
    readonly mailer: Mailer
    readonly now: Date
    readonly siteUrl: string
}

export interface OpenCompetition {
    readonly id: string
    readonly name: string
    readonly entryFeeCents: number
}

/** The newest competition taking entries: switched on, and before the Week 1 cut-off. Never a demo. */
export async function openCompetitionForEntries(db: Executor, now: Date): Promise<OpenCompetition | null> {
    const candidates = await db
        .select({ id: competitions.id, name: competitions.name, entryFeeCents: competitions.entryFeeCents })
        .from(competitions)
        .where(and(
            eq(competitions.entriesOpen, true),
            inArray(competitions.status, ['open', 'running']),
            eq(competitions.isDemo, false),
        ))
        .orderBy(sql`${competitions.createdAt} desc`)

    for (const competition of candidates) {
        const [weekOne] = await db
            .select({ number: weeks.number, cutoffAt: weeks.cutoffAt })
            .from(weeks)
            .where(and(eq(weeks.competitionId, competition.id), eq(weeks.number, 1)))
        if (areEntriesOpen(true, weekOne, now)) {
            return competition
        }
    }

    return null
}

/** Where to send the player, and the token to keep in their browser. */
export interface CheckoutStart {
    readonly url: string
    readonly checkoutToken: string
}

export type StartEntryResult =
    | { readonly kind: 'checkout'; readonly checkout: CheckoutStart }
    | { readonly kind: 'invalid'; readonly errors: Readonly<Partial<Record<'displayName' | 'email', EntryFieldError>>> }
    | { readonly kind: 'nameTaken' }
    | { readonly kind: 'closed' }

export async function startEntry(
    environment: PaymentEnvironment,
    input: { readonly displayName: string; readonly email: string },
): Promise<StartEntryResult> {
    const form = validateEntryForm(input)
    if (!form.ok) {
        return { kind: 'invalid', errors: form.errors }
    }

    const { db, now } = environment
    const created = await db.transaction(async (tx) => {
        const competition = await openCompetitionForEntries(tx, now)
        if (competition === null) {
            return { kind: 'closed' } as const
        }

        await expireHolds(tx, now, competition.id)

        // Entering again undoes an earlier deletion of the email (Decision 17).
        await tx.insert(people).values({ email: form.email })
            .onConflictDoUpdate({ target: people.email, set: { deletedAt: null } })
        const [person] = await tx.select({ id: people.id }).from(people).where(eq(people.email, form.email))
        if (person === undefined) {
            throw new Error('Could not save the person.')
        }

        // The same person sending the same name again (Back button, or Stripe
        // failed to open) carries on with their own pending entry.
        const key = displayNameKey(form.displayName)
        const [resumed] = await tx.update(entries)
            .set({ holdExpiresAt: holdExpiresAt(now) })
            .where(and(
                eq(entries.competitionId, competition.id),
                eq(entries.personId, person.id),
                eq(entries.displayNameKey, key),
                eq(entries.status, 'pending'),
            ))
            .returning({ id: entries.id })
        if (resumed !== undefined) {
            return { kind: 'created', entryId: resumed.id } as const
        }

        const [entry] = await tx.insert(entries).values({
            competitionId: competition.id,
            personId: person.id,
            displayName: form.displayName,
            displayNameKey: key,
            status: 'pending',
            holdExpiresAt: holdExpiresAt(now),
        }).onConflictDoNothing().returning({ id: entries.id })

        return entry === undefined ? { kind: 'nameTaken' } as const : { kind: 'created', entryId: entry.id } as const
    })

    if (created.kind !== 'created') {
        return created
    }

    return { kind: 'checkout', checkout: await beginCheckout(environment, created.entryId, 'entry') }
}

/**
 * Creates a Checkout session and records the pending payment. Returns
 * Stripe’s page address, and a token for the browser: coming back from
 * Stripe with it signs that browser in (claimCheckoutSignIn).
 */
export async function beginCheckout(
    environment: PaymentEnvironment,
    entryId: string,
    kind: PaymentKind,
): Promise<CheckoutStart> {
    const { db, gateway, now, siteUrl } = environment
    const [row] = await db
        .select({
            displayName: entries.displayName,
            holdExpiresAt: entries.holdExpiresAt,
            email: people.email,
            competitionName: competitions.name,
            entryFeeCents: competitions.entryFeeCents,
            buybackFeeCents: competitions.buybackFeeCents,
        })
        .from(entries)
        .innerJoin(people, eq(people.id, entries.personId))
        .innerJoin(competitions, eq(competitions.id, entries.competitionId))
        .where(eq(entries.id, entryId))
    if (row === undefined) {
        throw new Error(`No entry ${entryId}`)
    }

    const amountCents = kind === 'entry' ? row.entryFeeCents : row.buybackFeeCents
    const description = kind === 'entry'
        ? `${row.competitionName} entry · ${row.displayName}`
        : `${row.competitionName} buy-back · ${row.displayName}`
    const expiresAt = kind === 'entry' && row.holdExpiresAt !== null ? row.holdExpiresAt : new Date(now.getTime() + HOUR_MS)

    const session = await gateway.createCheckout({
        entryId,
        kind,
        amountCents,
        email: row.email,
        description,
        // Stripe fills in {CHECKOUT_SESSION_ID}, so it must stay unencoded.
        successUrl: `${siteUrl.replace(/\/$/, '')}/enter/complete?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${siteUrl.replace(/\/$/, '')}/enter/cancelled`,
        expiresAt,
    })

    const checkoutToken = newToken()
    await db.insert(payments).values({
        entryId,
        kind,
        method: 'stripe',
        status: 'pending',
        amountCents,
        stripeSessionId: session.sessionId,
        checkoutTokenHash: hashToken(checkoutToken),
    }).onConflictDoNothing()

    return { url: session.url, checkoutToken }
}

/**
 * The browser that started a Checkout is back, and the payment is paid.
 * Uses the token up (once only) and returns who to sign in, or `null`.
 */
export async function claimCheckoutSignIn(
    db: Database,
    sessionId: string,
    checkoutToken: string,
    now: Date,
): Promise<string | null> {
    const [claimed] = await db
        .update(payments)
        .set({ checkoutTokenUsedAt: now })
        .where(and(
            eq(payments.stripeSessionId, sessionId),
            eq(payments.status, 'paid'),
            eq(payments.checkoutTokenHash, hashToken(checkoutToken)),
            sql`${payments.checkoutTokenUsedAt} is null`,
        ))
        .returning({ entryId: payments.entryId })
    if (claimed === undefined) {
        return null
    }

    const [entry] = await db.select({ personId: entries.personId }).from(entries).where(eq(entries.id, claimed.entryId))
    return entry?.personId ?? null
}

type PaidCommand = Extract<WebhookCommand, { kind: 'paid' }>

export interface ConfirmResult {
    readonly applied: boolean
    readonly alert: ActivationAlert | null
}

export async function confirmPayment(environment: PaymentEnvironment, command: PaidCommand): Promise<ConfirmResult> {
    const { db, now } = environment

    const outcome = await db.transaction(async (tx) => {
        await tx.insert(payments).values({
            entryId: command.entryId,
            kind: command.paymentKind,
            method: 'stripe',
            status: 'pending',
            amountCents: command.amountCents,
            stripeSessionId: command.sessionId,
        }).onConflictDoNothing()

        const [payment] = await tx.select().from(payments)
            .where(eq(payments.stripeSessionId, command.sessionId))
            .for('update')
        const [entry] = await tx.select().from(entries).where(eq(entries.id, command.entryId)).for('update')
        if (payment === undefined || entry === undefined) {
            throw new Error(`Payment ${command.sessionId} refers to an unknown entry ${command.entryId}`)
        }

        const others = await tx.select({ key: entries.displayNameKey }).from(entries).where(and(
            eq(entries.competitionId, entry.competitionId),
            inArray(entries.status, ['pending', 'active']),
            ne(entries.id, entry.id),
        ))
        const isBuybackOpen = command.paymentKind === 'buyback'
            ? isBuybackWindowOpen(toGameState(await loadCompetitionRows(tx, entry.competitionId)), now)
            : true

        const decision = decideActivation({
            kind: command.paymentKind,
            paymentStatus: payment.status,
            entryStatus: entry.status,
            displayName: entry.displayName,
            takenKeys: new Set(others.map((other) => {
                return other.key
            })),
            ownKey: entry.displayNameKey,
            isBuybackOpen,
        })

        if (decision.kind === 'alreadyRecorded') {
            return { applied: false, alert: null, activated: false, personId: entry.personId, entry }
        }

        await tx.update(payments)
            .set({ status: 'paid', stripePaymentIntentId: command.paymentIntentId, amountCents: command.amountCents })
            .where(eq(payments.id, payment.id))

        if (decision.kind === 'activate') {
            await tx.update(entries).set({
                status: 'active',
                holdExpiresAt: null,
                displayName: decision.displayName,
                displayNameKey: displayNameKey(decision.displayName),
            }).where(eq(entries.id, entry.id))
        }

        if (decision.kind === 'buyback') {
            await tx.update(entries).set({ boughtBack: true }).where(eq(entries.id, entry.id))
        }

        if (decision.alert !== null) {
            const finalName = decision.kind === 'activate' ? decision.displayName : entry.displayName
            await tx.insert(alerts).values({
                competitionId: entry.competitionId,
                kind: `payment:${decision.alert}`,
                key: `payment:${decision.alert}:${command.sessionId}`,
                message: paymentAlertMessage(decision.alert, entry.displayName, finalName),
            }).onConflictDoNothing()
        }

        return {
            applied: true,
            alert: decision.alert,
            activated: decision.kind === 'activate',
            personId: entry.personId,
            entry,
        }
    })

    if (!outcome.applied) {
        return { applied: false, alert: null }
    }

    await recordFee(environment, command)
    if (outcome.activated) {
        await sendWelcome(environment, outcome.personId, outcome.entry.competitionId)
    }

    return { applied: true, alert: outcome.alert }
}

/**
 * The player is back from Checkout. If Stripe says the session is paid,
 * confirm it now, without waiting for the webhook. Safe to repeat.
 */
export async function reconcileCheckout(environment: PaymentEnvironment, sessionId: string) {
    const command = commandFromSession(await environment.gateway.retrieveCheckout(sessionId))
    if (command.kind === 'paid') {
        await confirmPayment(environment, command)
    }
}

export interface ReconcileReport {
    readonly checked: number
    readonly confirmed: number
    readonly failed: number
    readonly feesFilled: number
    readonly errors: number
}

/**
 * The tick's safety net. Asks Stripe about every Checkout from the last day
 * that is still pending here, then confirms the paid ones and closes the
 * expired ones. A player who pays and closes the tab before the webhook
 * arrives is confirmed within one tick.
 */
export async function reconcilePendingCheckouts(environment: PaymentEnvironment): Promise<ReconcileReport> {
    const { db, gateway, now } = environment
    const pending = await db
        .select({ sessionId: payments.stripeSessionId })
        .from(payments)
        .where(and(
            eq(payments.method, 'stripe'),
            eq(payments.status, 'pending'),
            gte(payments.createdAt, new Date(now.getTime() - 24 * HOUR_MS)),
            lte(payments.createdAt, new Date(now.getTime() - 2 * 60 * 1000)),
        ))

    let confirmed = 0
    let failed = 0
    let errors = 0
    for (const { sessionId } of pending) {
        if (sessionId === null) {
            continue
        }

        try {
            const session = await gateway.retrieveCheckout(sessionId)
            const command = commandFromSession(session)
            if (command.kind === 'paid') {
                await confirmPayment(environment, command)
                confirmed += 1
            } else if (session.status === 'expired') {
                await failCheckout(db, sessionId)
                failed += 1
            }
        } catch (error) {
            errors += 1
            console.warn(`Could not reconcile Checkout session ${sessionId}:`, error)
        }
    }

    const feesFilled = await fillMissingFees(environment)

    return { checked: pending.length, confirmed, failed, feesFilled, errors }
}

/**
 * Stripe sometimes has not settled the fee when a payment is first recorded.
 * Fills in fees still at 0 from the last 7 days, so the totals are right.
 */
async function fillMissingFees(environment: PaymentEnvironment): Promise<number> {
    const { db, gateway, now } = environment
    const missing = await db
        .select({ id: payments.id, paymentIntentId: payments.stripePaymentIntentId })
        .from(payments)
        .where(and(
            eq(payments.method, 'stripe'),
            eq(payments.status, 'paid'),
            eq(payments.feeCents, 0),
            gte(payments.createdAt, new Date(now.getTime() - 7 * 24 * HOUR_MS)),
        ))

    let filled = 0
    for (const payment of missing) {
        if (payment.paymentIntentId === null) {
            continue
        }

        try {
            const feeCents = await gateway.feeCents(payment.paymentIntentId)
            if (feeCents > 0) {
                await db.update(payments).set({ feeCents }).where(eq(payments.id, payment.id))
                filled += 1
            }
        } catch (error) {
            console.warn(`Could not fetch the Stripe fee for payment ${payment.id}:`, error)
        }
    }

    return filled
}

export async function failCheckout(db: Database, sessionId: string) {
    await db.update(payments)
        .set({ status: 'failed' })
        .where(and(eq(payments.stripeSessionId, sessionId), eq(payments.status, 'pending')))
}

/** Frees the names of pending entries whose hold has run out. */
export async function expireHolds(db: Executor, now: Date, competitionId: string) {
    await db.update(entries)
        .set({ status: 'expired', holdExpiresAt: null })
        .where(and(
            eq(entries.competitionId, competitionId),
            eq(entries.status, 'pending'),
            lte(entries.holdExpiresAt, now),
        ))
}

/** The fee is shown to the admin. Missing it must never undo a payment. */
async function recordFee(environment: PaymentEnvironment, command: PaidCommand) {
    if (command.paymentIntentId === null) {
        return
    }

    try {
        const feeCents = await environment.gateway.feeCents(command.paymentIntentId)
        await environment.db.update(payments).set({ feeCents }).where(eq(payments.stripeSessionId, command.sessionId))
    } catch (error) {
        console.warn(`Could not record the Stripe fee for ${command.sessionId}:`, error)
    }
}

async function sendWelcome(environment: PaymentEnvironment, personId: string, competitionId: string) {
    const { db, mailer, now, siteUrl } = environment
    const person = await findPersonById(db, personId)
    const [competition] = await db
        .select({ name: competitions.name })
        .from(competitions)
        .where(eq(competitions.id, competitionId))
    if (person === null || competition === undefined) {
        return
    }

    const token = await createLink(db, personId, 'signin', new Date(now.getTime() + WELCOME_LINK_TTL_MS), now)
    const link = new URL('/auth/verify', siteUrl)
    link.searchParams.set('token', token)
    link.searchParams.set('next', '/pick')

    await mailer.send({ to: person.email, ...welcomeEmail(link.toString(), competition.name) })
}

function paymentAlertMessage(alert: ActivationAlert, originalName: string, finalName: string): string {
    switch (alert) {
        case 'renamed':
            return `“${originalName}” paid after their name hold ran out, and someone else had taken the name. They are in as “${finalName}”. Rename them if needed.`
        case 'paidWhileWithdrawn':
            return `“${originalName}” paid, but their entry is withdrawn. Refund them or reinstate the entry.`
        case 'duplicatePayment':
            return `“${originalName}” paid the entry fee twice. Refund one of the payments.`
        case 'lateBuyback':
            return `“${originalName}” paid the buy-back after the Week 2 cut-off. It has been applied. Check this is what you want.`
        case 'buybackForInactiveEntry':
            return `“${originalName}” paid a buy-back, but their entry is not active. Refund the buy-back.`
    }
}
