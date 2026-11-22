// Created by Claude driven by Eddie Long on 2026-11-16.
//
// Stand-ins for Stripe and email, and a seeded competition, for the money
// tests. The fakes record what the code asked of them.

import type Stripe from 'stripe'

import { createCompetition } from '@/db/competitions'
import type { Database } from '@/db/client'
import { planCompetition } from '@/db/plan-competition'
import { weeks } from '@/db/schema'
import type { Mailer, EmailMessage } from '@/email/mailer'
import type { CheckoutRequest, PaymentGateway } from '@/payments/stripe'
import type { PaymentEnvironment } from '@/payments/service'
import type { FeedMatch } from '@/feeds/types'
import { and, eq } from 'drizzle-orm'

export const NOW = new Date('2026-11-10T12:00:00Z')
export const ENTRY_FEE_CENTS = 1000
export const BUYBACK_FEE_CENTS = 500
export const STRIPE_FEE_CENTS = 29

export interface FakeStripeSession {
    paymentStatus: 'paid' | 'unpaid'
    status: 'open' | 'complete' | 'expired'
}

export interface FakeGateway extends PaymentGateway {
    readonly requests: CheckoutRequest[]
    /** Every session id Stripe was asked about. */
    readonly retrievals: string[]
    readonly refunds: string[]
    readonly sessions: Map<string, FakeStripeSession & { request: CheckoutRequest }>
    /** What Stripe reports for a session. Sessions not set here are open and unpaid. */
    setSession(sessionId: string, state: FakeStripeSession): void
    /** Makes retrieveCheckout throw for this session. */
    failRetrieval(sessionId: string): void
}

export function fakeGateway(): FakeGateway {
    const requests: CheckoutRequest[] = []
    const retrievals: string[] = []
    const refunds: string[] = []
    const sessions = new Map<string, FakeStripeSession & { request: CheckoutRequest }>()
    const failing = new Set<string>()

    return {
        requests,
        retrievals,
        refunds,
        sessions,
        setSession: (sessionId, state) => {
            const existing = sessions.get(sessionId)
            if (existing === undefined) {
                throw new Error(`No fake session ${sessionId}`)
            }

            sessions.set(sessionId, { ...existing, ...state })
        },
        failRetrieval: (sessionId) => {
            failing.add(sessionId)
        },
        createCheckout: async (request) => {
            requests.push(request)
            const sessionId = `cs_test_${requests.length}`
            sessions.set(sessionId, { paymentStatus: 'unpaid', status: 'open', request })
            return { sessionId, url: `https://checkout.stripe.test/${sessionId}` }
        },
        retrieveCheckout: async (sessionId) => {
            retrievals.push(sessionId)
            const session = sessions.get(sessionId)
            if (failing.has(sessionId) || session === undefined) {
                throw new Error(`Stripe could not find ${sessionId}`)
            }

            return {
                id: sessionId,
                object: 'checkout.session',
                status: session.status,
                payment_status: session.paymentStatus,
                amount_total: session.request.amountCents,
                client_reference_id: session.request.entryId,
                metadata: { entryId: session.request.entryId, kind: session.request.kind },
                payment_intent: `pi_${sessionId}`,
            } as unknown as Stripe.Checkout.Session
        },
        feeCents: async () => {
            return STRIPE_FEE_CENTS
        },
        refund: async (paymentIntentId) => {
            refunds.push(paymentIntentId)
        },
    }
}

export interface FakeMailer extends Mailer {
    readonly sent: EmailMessage[]
}

export function fakeMailer(): FakeMailer {
    const sent: EmailMessage[] = []
    return {
        sent,
        send: async (message) => {
            sent.push(message)
        },
    }
}

export function environmentOf(
    db: Database,
    gateway: PaymentGateway,
    mailer: Mailer,
    now: Date = NOW,
): PaymentEnvironment {
    // No admin addresses unless a test sets them, so the real ADMIN_EMAILS is never used.
    return { db, gateway, mailer, now, siteUrl: 'https://lms.test', adminEmails: undefined }
}

function match(externalId: number, matchday: number, home: string, away: string, kickoff: string): FeedMatch {
    return {
        externalId,
        matchday,
        kickoffAt: new Date(kickoff),
        status: 'scheduled',
        home: { name: home, crestUrl: null },
        away: { name: away, crestUrl: null },
        score: null,
    }
}

export interface SeedOptions {
    readonly season?: number
    readonly weekOneCutoff?: Date | null
    readonly weekTwoCutoff?: Date | null
    readonly entriesOpen?: boolean
    readonly status?: 'draft' | 'open'
}

/** A real competition with two weeks, taking entries. Fees are €10 and €5. */
export async function seedCompetition(db: Database, options: SeedOptions = {}): Promise<string> {
    const plan = planCompetition([
        match(1, 11, 'Arsenal', 'Chelsea', '2026-11-21T15:00:00Z'),
        match(2, 11, 'Everton', 'Fulham', '2026-11-21T15:00:00Z'),
        match(3, 12, 'Arsenal', 'Everton', '2026-11-28T15:00:00Z'),
        match(4, 12, 'Chelsea', 'Fulham', '2026-11-28T15:00:00Z'),
    ], 11, 12)
    const competitionId = await createCompetition(db, {
        name: 'Last Man Standing Test',
        season: options.season ?? 2026,
        startMatchday: 11,
        finalMatchday: 12,
        entryFeeCents: ENTRY_FEE_CENTS,
        buybackFeeCents: BUYBACK_FEE_CENTS,
        prizeCents: 30_000,
        status: options.status ?? 'open',
    }, plan)

    for (const [number, cutoffAt] of [[1, options.weekOneCutoff], [2, options.weekTwoCutoff]] as const) {
        if (cutoffAt !== undefined && cutoffAt !== null) {
            await db.update(weeks).set({ cutoffAt, openedAt: NOW })
                .where(and(eq(weeks.competitionId, competitionId), eq(weeks.number, number)))
        }
    }

    if (options.entriesOpen === false) {
        const { competitions } = await import('@/db/schema')
        await db.update(competitions).set({ entriesOpen: false }).where(eq(competitions.id, competitionId))
    }

    return competitionId
}
