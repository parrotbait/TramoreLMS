// Created by Claude driven by Eddie Long on 2026-11-16.
//
// The money path, against a real Postgres: starting an entry, taking the
// payment, the webhook arriving twice, late and odd payments, buy-backs, and
// the totals the admin sees. Stripe and email are fakes. Everything else is
// real, including the database triggers.

import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { moneyTotals } from '@/admin/money'
import { hashToken } from '@/auth/tokens'
import { alerts, entries, payments, people, weeks } from '@/db/schema'
import type { WebhookCommand } from '@/payments/webhook-events'

import { createTestDatabase } from '../../__tests__/support/database'
import type { TestDatabase } from '../../__tests__/support/database'
import {
    BUYBACK_FEE_CENTS,
    ENTRY_FEE_CENTS,
    NOW,
    STRIPE_FEE_CENTS,
    environmentOf,
    fakeGateway,
    fakeMailer,
    seedCompetition,
} from '../../__tests__/support/payments'
import {
    beginCheckout,
    claimCheckoutSignIn,
    confirmPayment,
    expireHolds,
    failCheckout,
    reconcilePendingCheckouts,
    startEntry,
} from '../service'

type PaidCommand = Extract<WebhookCommand, { kind: 'paid' }>

const HOUR_MS = 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

let database: TestDatabase

beforeAll(async () => {
    database = await createTestDatabase()
}, 60_000)

afterAll(async () => {
    await database.close()
})

beforeEach(async () => {
    await database.reset()
})

/** One test’s world: a seeded competition, fake Stripe, fake email. */
async function rig(options: Parameters<typeof seedCompetition>[1] = {}) {
    const { db } = database
    const gateway = fakeGateway()
    const mailer = fakeMailer()
    const competitionId = await seedCompetition(db, options)
    const environment = (now: Date = NOW) => {
        return environmentOf(db, gateway, mailer, now)
    }

    /** Starts an entry and returns its id, session and token. */
    const enter = async (displayName: string, email: string, now: Date = NOW) => {
        const result = await startEntry(environment(now), { displayName, email })
        if (result.kind !== 'checkout') {
            throw new Error(`Expected a checkout, got ${result.kind}`)
        }

        const [found] = await db
            .select({ entry: entries })
            .from(entries)
            .innerJoin(people, eq(people.id, entries.personId))
            .where(and(eq(people.email, email), eq(entries.displayName, displayName)))
        const entry = found?.entry
        const [payment] = await db.select().from(payments).where(eq(payments.entryId, entry?.id ?? ''))
        if (entry === undefined || payment === undefined || payment.stripeSessionId === null) {
            throw new Error('The entry and its pending payment should exist.')
        }

        return { entryId: entry.id, sessionId: payment.stripeSessionId, token: result.checkout.checkoutToken }
    }

    /** What the webhook hands us when Stripe says the session is paid. */
    const paid = (
        entryId: string,
        sessionId: string,
        overrides: Partial<PaidCommand> = {},
    ): PaidCommand => {
        return {
            kind: 'paid',
            sessionId,
            entryId,
            paymentKind: 'entry',
            amountCents: ENTRY_FEE_CENTS,
            paymentIntentId: `pi_${sessionId}`,
            ...overrides,
        }
    }

    /** An entry that has entered and paid, so it is active. */
    const activeEntry = async (displayName: string, email: string) => {
        const started = await enter(displayName, email)
        await confirmPayment(environment(), paid(started.entryId, started.sessionId))
        mailer.sent.length = 0
        return started
    }

    return { db, gateway, mailer, competitionId, environment, enter, paid, activeEntry }
}

/** Drizzle wraps a database error. The message the database gave is in `cause`. */
async function databaseMessageOf(statement: PromiseLike<unknown>): Promise<string> {
    try {
        await statement
    } catch (error) {
        const cause = error instanceof Error ? error.cause : undefined
        return cause instanceof Error ? cause.message : String(error)
    }

    return 'The database accepted it.'
}

async function paymentsOf(entryId: string) {
    return database.db.select().from(payments).where(eq(payments.entryId, entryId))
}

async function entryOf(entryId: string) {
    const [entry] = await database.db.select().from(entries).where(eq(entries.id, entryId))
    if (entry === undefined) {
        throw new Error(`No entry ${entryId}`)
    }

    return entry
}

describe('starting an entry', () => {
    it('holds the name, asks Stripe for the entry fee, and records a pending payment', async () => {
        const { gateway, mailer, enter, db } = await rig()

        const started = await enter('Aoife', 'aoife@example.ie')

        expect(gateway.requests).toHaveLength(1)
        expect(gateway.requests[0]).toMatchObject({
            kind: 'entry',
            amountCents: ENTRY_FEE_CENTS,
            email: 'aoife@example.ie',
            entryId: started.entryId,
        })

        const entry = await entryOf(started.entryId)
        expect(entry.status).toBe('pending')
        expect(entry.holdExpiresAt).toEqual(new Date(NOW.getTime() + HOUR_MS))

        const [payment] = await paymentsOf(started.entryId)
        expect(payment).toMatchObject({ status: 'pending', method: 'stripe', kind: 'entry', amountCents: ENTRY_FEE_CENTS })
        expect(payment?.checkoutTokenHash).toBe(hashToken(started.token))

        // Nothing is promised to the player until the money arrives.
        expect(mailer.sent).toEqual([])
        expect(await db.select().from(people)).toHaveLength(1)
    })

    it('takes no entries when entries are switched off', async () => {
        const { gateway, environment } = await rig({ entriesOpen: false })

        const result = await startEntry(environment(), { displayName: 'Aoife', email: 'aoife@example.ie' })

        expect(result.kind).toBe('closed')
        expect(gateway.requests).toEqual([])
    })

    it('takes no entries for a draft competition', async () => {
        const { gateway, environment } = await rig({ status: 'draft' })

        const result = await startEntry(environment(), { displayName: 'Aoife', email: 'aoife@example.ie' })

        expect(result.kind).toBe('closed')
        expect(gateway.requests).toEqual([])
    })

    it('takes no entries after the Week 1 cut-off', async () => {
        const cutoff = new Date(NOW.getTime() - MINUTE_MS)
        const { gateway, environment } = await rig({ weekOneCutoff: cutoff })

        const result = await startEntry(environment(), { displayName: 'Aoife', email: 'aoife@example.ie' })

        expect(result.kind).toBe('closed')
        expect(gateway.requests).toEqual([])
    })

    it('still takes entries a minute before the Week 1 cut-off', async () => {
        const cutoff = new Date(NOW.getTime() + MINUTE_MS)
        const { environment } = await rig({ weekOneCutoff: cutoff })

        const result = await startEntry(environment(), { displayName: 'Aoife', email: 'aoife@example.ie' })

        expect(result.kind).toBe('checkout')
    })

    it('rejects a name already held or taken, in any case or accent, without asking Stripe', async () => {
        const { gateway, environment, activeEntry } = await rig()
        await activeEntry('Seán', 'sean@example.ie')
        gateway.requests.length = 0

        const result = await startEntry(environment(), { displayName: 'SEAN', email: 'someone.else@example.ie' })

        expect(result.kind).toBe('nameTaken')
        expect(gateway.requests).toEqual([])
    })

    it('lets the same person carry on with their own pending entry, without making a second one', async () => {
        const { db, environment, enter } = await rig()
        await enter('Aoife', 'aoife@example.ie')
        const later = new Date(NOW.getTime() + 10 * MINUTE_MS)

        const again = await startEntry(environment(later), { displayName: 'Aoife', email: 'aoife@example.ie' })

        expect(again.kind).toBe('checkout')
        const rows = await db.select().from(entries)
        expect(rows).toHaveLength(1)
        expect(rows[0]?.holdExpiresAt).toEqual(new Date(later.getTime() + HOUR_MS))
    })

    it('frees a name once its hold has run out', async () => {
        const { environment, enter } = await rig()
        await enter('Aoife', 'aoife@example.ie')
        const afterHold = new Date(NOW.getTime() + HOUR_MS + MINUTE_MS)

        const result = await startEntry(environment(afterHold), { displayName: 'Aoife', email: 'other@example.ie' })

        expect(result.kind).toBe('checkout')
    })
})

describe('taking the payment', () => {
    it('makes the entry active, records what was paid and the Stripe fee, and sends one welcome email', async () => {
        const { environment, enter, paid, mailer } = await rig()
        const started = await enter('Aoife', 'aoife@example.ie')

        const result = await confirmPayment(environment(), paid(started.entryId, started.sessionId))

        expect(result).toEqual({ applied: true, alert: null })
        const entry = await entryOf(started.entryId)
        expect(entry).toMatchObject({ status: 'active', holdExpiresAt: null, displayName: 'Aoife' })
        const [payment] = await paymentsOf(started.entryId)
        expect(payment).toMatchObject({
            status: 'paid',
            amountCents: ENTRY_FEE_CENTS,
            feeCents: STRIPE_FEE_CENTS,
            stripePaymentIntentId: `pi_${started.sessionId}`,
        })

        expect(mailer.sent).toHaveLength(1)
        expect(mailer.sent[0]?.to).toBe('aoife@example.ie')
        expect(mailer.sent[0]?.text).toContain('https://lms.test/auth/verify?token=')
    })

    it('records the amount Stripe took, not the amount we expected', async () => {
        const { environment, enter, paid } = await rig()
        const started = await enter('Aoife', 'aoife@example.ie')

        await confirmPayment(environment(), paid(started.entryId, started.sessionId, { amountCents: 1200 }))

        const [payment] = await paymentsOf(started.entryId)
        expect(payment?.amountCents).toBe(1200)
    })

    it('is safe when Stripe sends the same event again: one payment, one email, no change', async () => {
        const { environment, enter, paid, mailer } = await rig()
        const started = await enter('Aoife', 'aoife@example.ie')
        const command = paid(started.entryId, started.sessionId)

        const first = await confirmPayment(environment(), command)
        const second = await confirmPayment(environment(), command)
        const third = await confirmPayment(environment(), command)

        expect([first.applied, second.applied, third.applied]).toEqual([true, false, false])
        const rows = await paymentsOf(started.entryId)
        expect(rows).toHaveLength(1)
        expect(rows[0]?.amountCents).toBe(ENTRY_FEE_CENTS)
        expect(mailer.sent).toHaveLength(1)
    })

    it('is safe when the webhook and the return page confirm at the same moment', async () => {
        const { environment, enter, paid, mailer } = await rig()
        const started = await enter('Aoife', 'aoife@example.ie')
        const command = paid(started.entryId, started.sessionId)

        const results = await Promise.all([
            confirmPayment(environment(), command),
            confirmPayment(environment(), command),
            confirmPayment(environment(), command),
        ])

        expect(results.filter((result) => {
            return result.applied
        })).toHaveLength(1)
        expect(await paymentsOf(started.entryId)).toHaveLength(1)
        expect(mailer.sent).toHaveLength(1)
    })

    it('still honours a payment whose pending record was never saved', async () => {
        const { environment, enter, paid, db } = await rig()
        const started = await enter('Aoife', 'aoife@example.ie')
        await db.delete(payments).where(eq(payments.entryId, started.entryId))

        const result = await confirmPayment(environment(), paid(started.entryId, started.sessionId))

        expect(result.applied).toBe(true)
        expect((await entryOf(started.entryId)).status).toBe('active')
        expect(await paymentsOf(started.entryId)).toHaveLength(1)
    })

    it('rejects a payment for an entry that does not exist, and records nothing', async () => {
        const { environment, paid, db } = await rig()

        await expect(
            confirmPayment(environment(), paid('00000000-0000-4000-8000-000000000000', 'cs_nope')),
        ).rejects.toThrow()

        expect(await db.select().from(payments)).toEqual([])
    })

    it('puts the player in as “Name (2)” when they paid after the hold ran out and someone else took the name', async () => {
        const { environment, enter, paid, db } = await rig()
        const first = await enter('Aoife', 'aoife@example.ie')
        const afterHold = new Date(NOW.getTime() + HOUR_MS + MINUTE_MS)
        const second = await enter('Aoife', 'second.aoife@example.ie', afterHold)
        await confirmPayment(environment(afterHold), paid(second.entryId, second.sessionId))

        const result = await confirmPayment(environment(afterHold), paid(first.entryId, first.sessionId))

        expect(result).toEqual({ applied: true, alert: 'renamed' })
        const entry = await entryOf(first.entryId)
        expect(entry.status).toBe('active')
        expect(entry.displayName).toBe('Aoife (2)')
        expect((await paymentsOf(first.entryId))[0]?.status).toBe('paid')
        const [alert] = await db.select().from(alerts)
        expect(alert?.kind).toBe('payment:renamed')
    })

    it('keeps the money on record, and tells the admin, when a withdrawn entry pays', async () => {
        const { environment, enter, paid, mailer, db } = await rig()
        const started = await enter('Aoife', 'aoife@example.ie')
        await db.update(entries).set({ status: 'withdrawn', holdExpiresAt: null }).where(eq(entries.id, started.entryId))

        const result = await confirmPayment(environment(), paid(started.entryId, started.sessionId))

        expect(result).toEqual({ applied: true, alert: 'paidWhileWithdrawn' })
        expect((await entryOf(started.entryId)).status).toBe('withdrawn')
        expect((await paymentsOf(started.entryId))[0]).toMatchObject({ status: 'paid', amountCents: ENTRY_FEE_CENTS })
        expect(mailer.sent).toEqual([])
        expect((await db.select().from(alerts))[0]?.kind).toBe('payment:paidWhileWithdrawn')
    })

    it('keeps both payments, and tells the admin, when an active entry pays twice', async () => {
        const { environment, gateway, activeEntry, paid, db } = await rig()
        const active = await activeEntry('Aoife', 'aoife@example.ie')
        const second = await beginCheckout(environment(), active.entryId, 'entry')
        const secondSession = gateway.requests.length === 2 ? `cs_test_${gateway.requests.length}` : ''
        expect(second.url).toContain(secondSession)

        const result = await confirmPayment(environment(), paid(active.entryId, secondSession))

        expect(result).toEqual({ applied: true, alert: 'duplicatePayment' })
        const rows = await paymentsOf(active.entryId)
        expect(rows.filter((row) => {
            return row.status === 'paid'
        })).toHaveLength(2)
        const totals = moneyTotals(rows, 30_000)
        expect(totals.grossCents).toBe(2 * ENTRY_FEE_CENTS)
        expect((await db.select().from(alerts))[0]?.kind).toBe('payment:duplicatePayment')
    })
})

describe('a Checkout that fails or expires', () => {
    it('marks a pending payment failed, and leaves the entry pending until its hold runs out', async () => {
        const { db, enter } = await rig()
        const started = await enter('Aoife', 'aoife@example.ie')

        await failCheckout(db, started.sessionId)

        expect((await paymentsOf(started.entryId))[0]?.status).toBe('failed')
        expect((await entryOf(started.entryId)).status).toBe('pending')
    })

    it('never undoes a payment that is already paid, even if a late “expired” event arrives', async () => {
        const { db, environment, enter, paid } = await rig()
        const started = await enter('Aoife', 'aoife@example.ie')
        await confirmPayment(environment(), paid(started.entryId, started.sessionId))

        await failCheckout(db, started.sessionId)

        expect((await paymentsOf(started.entryId))[0]?.status).toBe('paid')
        expect((await entryOf(started.entryId)).status).toBe('active')
    })

    it('expires only holds that have run out, and only for pending entries', async () => {
        const { db, competitionId, enter, activeEntry } = await rig()
        const waiting = await enter('Waiting', 'waiting@example.ie')
        const fresh = await enter('Fresh', 'fresh@example.ie', new Date(NOW.getTime() + 30 * MINUTE_MS))
        const active = await activeEntry('Active', 'active@example.ie')

        await expireHolds(db, new Date(NOW.getTime() + HOUR_MS + MINUTE_MS), competitionId)

        expect((await entryOf(waiting.entryId)).status).toBe('expired')
        expect((await entryOf(fresh.entryId)).status).toBe('pending')
        expect((await entryOf(active.entryId)).status).toBe('active')
    })
})

describe('signing in after paying', () => {
    it('signs in only the browser that started the Checkout, only once, and only when paid', async () => {
        const { db, environment, enter, paid } = await rig()
        const started = await enter('Aoife', 'aoife@example.ie')

        expect(await claimCheckoutSignIn(db, started.sessionId, started.token, NOW)).toBeNull()

        await confirmPayment(environment(), paid(started.entryId, started.sessionId))
        expect(await claimCheckoutSignIn(db, started.sessionId, 'the-wrong-token', NOW)).toBeNull()

        const personId = await claimCheckoutSignIn(db, started.sessionId, started.token, NOW)
        expect(personId).toBe((await entryOf(started.entryId)).personId)
        expect(await claimCheckoutSignIn(db, started.sessionId, started.token, NOW)).toBeNull()
    })
})

describe('the safety net for payments that did not reach us', () => {
    /** Makes a pending payment look like it was started `minutesAgo` minutes before NOW. */
    async function ageOf(sessionId: string, minutesAgo: number) {
        await database.db.update(payments)
            .set({ createdAt: new Date(NOW.getTime() - minutesAgo * MINUTE_MS) })
            .where(eq(payments.stripeSessionId, sessionId))
    }

    it('confirms paid sessions, closes expired ones, leaves new ones, and carries on past an error', async () => {
        const { db, gateway, environment, enter } = await rig()
        const paidSession = await enter('Paid', 'paid@example.ie')
        const expiredSession = await enter('Expired', 'expired@example.ie')
        const newSession = await enter('Brand new', 'new@example.ie')
        const brokenSession = await enter('Broken', 'broken@example.ie')
        gateway.setSession(paidSession.sessionId, { paymentStatus: 'paid', status: 'complete' })
        gateway.setSession(expiredSession.sessionId, { paymentStatus: 'unpaid', status: 'expired' })
        gateway.setSession(newSession.sessionId, { paymentStatus: 'paid', status: 'complete' })
        gateway.failRetrieval(brokenSession.sessionId)
        await ageOf(paidSession.sessionId, 10)
        await ageOf(expiredSession.sessionId, 10)
        await ageOf(newSession.sessionId, 0.5)
        await ageOf(brokenSession.sessionId, 10)

        const report = await reconcilePendingCheckouts(environment())

        expect(report).toMatchObject({ checked: 3, confirmed: 1, failed: 1, errors: 1 })
        expect((await entryOf(paidSession.entryId)).status).toBe('active')
        expect((await paymentsOf(paidSession.entryId))[0]?.status).toBe('paid')
        expect((await paymentsOf(expiredSession.entryId))[0]?.status).toBe('failed')
        expect((await paymentsOf(newSession.entryId))[0]?.status).toBe('pending')
        expect((await paymentsOf(brokenSession.entryId))[0]?.status).toBe('pending')
        expect(await db.select().from(payments).where(eq(payments.status, 'paid'))).toHaveLength(1)
    })

    it('ignores payments older than a day', async () => {
        const { gateway, environment, enter } = await rig()
        const old = await enter('Old', 'old@example.ie')
        gateway.setSession(old.sessionId, { paymentStatus: 'paid', status: 'complete' })
        await ageOf(old.sessionId, 25 * 60)

        const report = await reconcilePendingCheckouts(environment())

        expect(report.checked).toBe(0)
        expect((await entryOf(old.entryId)).status).toBe('pending')
    })

    it('fills in a Stripe fee that was still 0 when the payment was recorded', async () => {
        const { db, environment, enter, paid } = await rig()
        const started = await enter('Aoife', 'aoife@example.ie')
        await confirmPayment(environment(), paid(started.entryId, started.sessionId))
        await db.update(payments).set({ feeCents: 0, createdAt: new Date(NOW.getTime() - HOUR_MS) })
            .where(eq(payments.entryId, started.entryId))

        const report = await reconcilePendingCheckouts(environment())

        expect(report.feesFilled).toBe(1)
        expect((await paymentsOf(started.entryId))[0]?.feeCents).toBe(STRIPE_FEE_CENTS)
    })
})

describe('buying back in', () => {
    it('asks Stripe for the buy-back fee, and on payment marks the entry bought back without a welcome email', async () => {
        const { gateway, environment, activeEntry, paid, mailer } = await rig()
        const active = await activeEntry('Aoife', 'aoife@example.ie')

        await beginCheckout(environment(), active.entryId, 'buyback')
        const request = gateway.requests.at(-1)
        expect(request).toMatchObject({ kind: 'buyback', amountCents: BUYBACK_FEE_CENTS, entryId: active.entryId })

        const result = await confirmPayment(environment(), paid(active.entryId, 'cs_test_2', {
            paymentKind: 'buyback',
            amountCents: BUYBACK_FEE_CENTS,
        }))

        expect(result).toEqual({ applied: true, alert: null })
        expect((await entryOf(active.entryId)).boughtBack).toBe(true)
        const buyback = (await paymentsOf(active.entryId)).find((row) => {
            return row.kind === 'buyback'
        })
        expect(buyback).toMatchObject({ status: 'paid', amountCents: BUYBACK_FEE_CENTS })
        expect(mailer.sent).toEqual([])
    })

    it('applies a buy-back paid after the Week 2 cut-off, and tells the admin', async () => {
        const { environment, activeEntry, paid, db } = await rig({ weekTwoCutoff: new Date(NOW.getTime() - HOUR_MS) })
        const active = await activeEntry('Aoife', 'aoife@example.ie')
        await beginCheckout(environment(), active.entryId, 'buyback')

        const result = await confirmPayment(environment(), paid(active.entryId, 'cs_test_2', {
            paymentKind: 'buyback',
            amountCents: BUYBACK_FEE_CENTS,
        }))

        expect(result).toEqual({ applied: true, alert: 'lateBuyback' })
        expect((await entryOf(active.entryId)).boughtBack).toBe(true)
        expect((await db.select().from(alerts))[0]?.kind).toBe('payment:lateBuyback')
    })

    it('records, but does not apply, a buy-back for an entry that is not active', async () => {
        const { environment, enter, paid } = await rig()
        const pending = await enter('Aoife', 'aoife@example.ie')
        await beginCheckout(environment(), pending.entryId, 'buyback')

        const result = await confirmPayment(environment(), paid(pending.entryId, 'cs_test_2', {
            paymentKind: 'buyback',
            amountCents: BUYBACK_FEE_CENTS,
        }))

        expect(result).toEqual({ applied: true, alert: 'buybackForInactiveEntry' })
        expect((await entryOf(pending.entryId)).boughtBack).toBe(false)
        expect((await entryOf(pending.entryId)).status).toBe('pending')
    })

    it('tells the admin when a player pays the buy-back a second time', async () => {
        const { environment, activeEntry, paid } = await rig()
        const active = await activeEntry('Aoife', 'aoife@example.ie')
        await beginCheckout(environment(), active.entryId, 'buyback')
        await beginCheckout(environment(), active.entryId, 'buyback')
        const buyback = { paymentKind: 'buyback', amountCents: BUYBACK_FEE_CENTS } as const
        await confirmPayment(environment(), paid(active.entryId, 'cs_test_2', buyback))

        const second = await confirmPayment(environment(), paid(active.entryId, 'cs_test_3', buyback))

        expect(second).toEqual({ applied: true, alert: 'duplicateBuyback' })
    })
})

describe('the totals the admin sees', () => {
    it('adds up paid entries and buy-backs, and the Stripe fees, from real payments', async () => {
        const { environment, activeEntry, paid, db } = await rig()
        const aoife = await activeEntry('Aoife', 'aoife@example.ie')
        await activeEntry('Seán', 'sean@example.ie')
        await beginCheckout(environment(), aoife.entryId, 'buyback')
        await confirmPayment(environment(), paid(aoife.entryId, 'cs_test_3', {
            paymentKind: 'buyback',
            amountCents: BUYBACK_FEE_CENTS,
        }))
        // A player who started but never paid does not count.
        await startEntry(environment(), { displayName: 'Never paid', email: 'never@example.ie' })

        const totals = moneyTotals(await db.select().from(payments), 30_000)

        expect(totals).toMatchObject({
            entryCount: 2,
            entryCents: 2 * ENTRY_FEE_CENTS,
            buybackCount: 1,
            buybackCents: BUYBACK_FEE_CENTS,
            grossCents: 2 * ENTRY_FEE_CENTS + BUYBACK_FEE_CENTS,
            feesCents: 3 * STRIPE_FEE_CENTS,
            refundedCents: 0,
            netRaisedCents: 2 * ENTRY_FEE_CENTS + BUYBACK_FEE_CENTS - 3 * STRIPE_FEE_CENTS - 30_000,
        })
    })
})

describe('what the database itself refuses', () => {
    it('will not make an entry active without a paid entry payment', async () => {
        const { db, enter } = await rig()
        const started = await enter('Aoife', 'aoife@example.ie')

        const attempt = db.update(entries).set({ status: 'active', holdExpiresAt: null })
            .where(eq(entries.id, started.entryId))

        expect(await databaseMessageOf(attempt)).toMatch(/no paid entry payment/)
    })

    it('will not let a paid entry payment be taken back while the entry is still active', async () => {
        const { db, environment, enter, paid } = await rig()
        const started = await enter('Aoife', 'aoife@example.ie')
        await confirmPayment(environment(), paid(started.entryId, started.sessionId))

        const attempt = db.update(payments).set({ status: 'refunded' }).where(eq(payments.entryId, started.entryId))

        expect(await databaseMessageOf(attempt)).toMatch(/no paid entry payment/)
    })

    it('keeps one payment per Stripe session', async () => {
        const { db, enter } = await rig()
        const started = await enter('Aoife', 'aoife@example.ie')

        await expect(
            db.insert(payments).values({
                entryId: started.entryId,
                kind: 'entry',
                method: 'stripe',
                status: 'pending',
                amountCents: ENTRY_FEE_CENTS,
                stripeSessionId: started.sessionId,
            }),
        ).rejects.toThrow()
        expect(await db.select().from(people)).toHaveLength(1)
        expect(await db.select().from(weeks)).not.toHaveLength(0)
    })
})
