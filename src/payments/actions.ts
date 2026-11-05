// Created by Claude driven by Eddie Long on 2026-11-02.

'use server'

import { and, eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { currentSession, siteUrl } from '@/auth/session'
import { getDatabase } from '@/db/client'
import { toGameState } from '@/db/game-state'
import { loadCompetitionRows } from '@/db/load'
import { entries } from '@/db/schema'
import { competitionNow } from '@/demo/clock'
import { recordDemoBuyback } from '@/demo/service'
import { mailerFromEnv } from '@/email/mailer'
import { computeStandings, isBuybackAvailable } from '@/engine'
import { isUuid } from '@/lib/ids'

import { CHECKOUT_COOKIE } from './checkout-cookie'
import { holdExpiresAt } from './entry-rules'
import type { EntryFieldError } from './entry-rules'
import { beginCheckout, startEntry } from './service'
import type { CheckoutStart, PaymentEnvironment } from './service'
import { gatewayFromEnv } from './stripe'

export interface EntryFormState {
    readonly values: { readonly displayName: string; readonly email: string }
    readonly errors: Readonly<Partial<Record<'displayName' | 'email', EntryFieldError>>>
    readonly problem: 'nameTaken' | 'closed' | 'paymentUnavailable' | null
}

export async function startEntryAction(_previous: EntryFormState, formData: FormData): Promise<EntryFormState> {
    const values = {
        displayName: String(formData.get('displayName') ?? ''),
        email: String(formData.get('email') ?? ''),
    }

    let checkout: CheckoutStart
    try {
        const result = await startEntry(paymentEnvironment(), values)
        switch (result.kind) {
            case 'invalid':
                return { values, errors: result.errors, problem: null }
            case 'nameTaken':
                return { values, errors: {}, problem: 'nameTaken' }
            case 'closed':
                return { values, errors: {}, problem: 'closed' }
            case 'checkout':
                checkout = result.checkout
                break
        }
    } catch (error) {
        console.error('Could not start an entry:', error)
        return { values, errors: {}, problem: 'paymentUnavailable' }
    }

    return goToCheckout(checkout)
}

/** The Pay button on the “Finish your payment” screen. */
export async function payAction(formData: FormData) {
    const entryId = String(formData.get('entryId') ?? '')
    const entry = await ownEntry(entryId)
    const isHeld = entry?.status === 'pending' && entry.holdExpiresAt !== null && entry.holdExpiresAt.getTime() > Date.now()
    if (entry === null || !isHeld) {
        redirect('/pick')
    }

    const db = getDatabase()
    await db.update(entries).set({ holdExpiresAt: holdExpiresAt(new Date()) }).where(eq(entries.id, entry.id))
    await goToCheckout(await beginCheckout(paymentEnvironment(), entry.id, 'entry'))
}

/** The buy-back button, for Week 1 losers until the Week 2 cut-off (rule 3). */
export async function buyBackAction(formData: FormData) {
    const entryId = String(formData.get('entryId') ?? '')
    const entry = await ownEntry(entryId)
    if (entry === null || entry.status !== 'active') {
        redirect('/pick')
    }

    const rows = await loadCompetitionRows(getDatabase(), entry.competitionId)
    const now = competitionNow(rows.competition, new Date())
    const state = toGameState(rows)
    if (!isBuybackAvailable(state, computeStandings(state, now), now, entry.id)) {
        redirect('/pick')
    }

    // A demo never takes money. The buy-back is recorded at €0 instead.
    if (rows.competition.isDemo) {
        await recordDemoBuyback(getDatabase(), entry.id)
        redirect('/pick')
    }

    await goToCheckout(await beginCheckout(paymentEnvironment(), entry.id, 'buyback'))
}

/**
 * Keeps the checkout token in this browser, then opens Stripe. Coming back
 * from Stripe with it signs this browser in (/enter/complete).
 */
async function goToCheckout(checkout: CheckoutStart): Promise<never> {
    (await cookies()).set(CHECKOUT_COOKIE, checkout.checkoutToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/enter',
        maxAge: 2 * 60 * 60,
    })
    redirect(checkout.url)
}

/** The entry, if it belongs to the signed-in person. */
async function ownEntry(entryId: string) {
    const session = await currentSession()
    if (session === null) {
        redirect('/signin?next=/pick')
    }

    if (!isUuid(entryId)) {
        return null
    }

    const [entry] = await getDatabase()
        .select()
        .from(entries)
        .where(and(eq(entries.id, entryId), eq(entries.personId, session.personId)))

    return entry ?? null
}

function paymentEnvironment(): PaymentEnvironment {
    return {
        db: getDatabase(),
        gateway: gatewayFromEnv(),
        mailer: mailerFromEnv(),
        now: new Date(),
        siteUrl: siteUrl(),
    }
}
