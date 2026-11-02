// Created by Claude driven by Eddie Long on 2026-11-02.

'use server'

import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { currentSession, siteUrl } from '@/auth/session'
import { getDatabase } from '@/db/client'
import { toGameState } from '@/db/game-state'
import { loadCompetitionRows } from '@/db/load'
import { entries } from '@/db/schema'
import { mailerFromEnv } from '@/email/mailer'
import { computeStandings, isBuybackAvailable } from '@/engine'

import { holdExpiresAt } from './entry-rules'
import type { EntryFieldError } from './entry-rules'
import { beginCheckout, startEntry } from './service'
import type { PaymentEnvironment } from './service'
import { gatewayFromEnv } from './stripe'

export interface EntryFormState {
    readonly values: { readonly displayName: string; readonly email: string; readonly futureCommsOptIn: boolean }
    readonly errors: Readonly<Partial<Record<'displayName' | 'email', EntryFieldError>>>
    readonly problem: 'nameTaken' | 'closed' | 'paymentUnavailable' | null
}

export async function startEntryAction(_previous: EntryFormState, formData: FormData): Promise<EntryFormState> {
    const values = {
        displayName: String(formData.get('displayName') ?? ''),
        email: String(formData.get('email') ?? ''),
        futureCommsOptIn: formData.get('futureCommsOptIn') === 'on',
    }

    let url: string
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
                url = result.url
                break
        }
    } catch (error) {
        console.error('Could not start an entry:', error)
        return { values, errors: {}, problem: 'paymentUnavailable' }
    }

    redirect(url)
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
    redirect(await beginCheckout(paymentEnvironment(), entry.id, 'entry'))
}

/** The buy-back button, for Week 1 losers until the Week 2 cut-off (rule 3). */
export async function buyBackAction(formData: FormData) {
    const entryId = String(formData.get('entryId') ?? '')
    const entry = await ownEntry(entryId)
    if (entry === null || entry.status !== 'active') {
        redirect('/pick')
    }

    const now = new Date()
    const state = toGameState(await loadCompetitionRows(getDatabase(), entry.competitionId))
    if (!isBuybackAvailable(state, computeStandings(state, now), now, entry.id)) {
        redirect('/pick')
    }

    redirect(await beginCheckout(paymentEnvironment(), entry.id, 'buyback'))
}

/** The entry, if it belongs to the signed-in person. */
async function ownEntry(entryId: string) {
    const session = await currentSession()
    if (session === null) {
        redirect('/signin?next=/pick')
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
