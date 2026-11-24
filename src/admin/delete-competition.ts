// Created by Claude driven by Eddie Long on 2026-11-24.
//
// Deleting a draft competition, for example one used for testing.
//
// An empty draft can always go. A draft with entries can go if no real money
// was taken. Payments that never completed (pending or failed) moved no money.
//   - Stripe test payments (session ids that start with “cs_test_”) are fine.
//   - Cash, Revolut and other payments are added by hand, so the code can’t tell
//     a test from the real thing. The admin must confirm that they were tests.
//   - Live Stripe payments are never deleted, as the treasurer needs the record.

import { eq, inArray } from 'drizzle-orm'

import type { Database } from '@/db/client'
import { competitions, entries, payments } from '@/db/schema'

import { recordAudit } from './audit'

const TEST_SESSION_PREFIX = 'cs_test_'

export type DeleteDraftResult =
    | { readonly kind: 'deleted'; readonly name: string; readonly entryCount: number }
    | { readonly kind: 'noCompetition' }
    | { readonly kind: 'demo' }
    | { readonly kind: 'notDraft' }
    /** Live Stripe payments exist. The record must stay. */
    | { readonly kind: 'liveMoney'; readonly paymentCount: number }
    /** Payments added by hand exist, and the admin hasn’t said they were tests. */
    | { readonly kind: 'manualMoney'; readonly paymentCount: number }

/** True when the payment is a Stripe test payment, which moved no real money. */
export function isTestPayment(payment: { readonly method: string; readonly stripeSessionId: string | null }): boolean {
    if (payment.method !== 'stripe') {
        return false
    }

    return payment.stripeSessionId?.startsWith(TEST_SESSION_PREFIX) ?? false
}

export async function deleteDraftCompetition(
    db: Database,
    competitionId: string,
    actorEmail: string,
    reason: string,
    options: { readonly manualPaymentsAreTests: boolean } = { manualPaymentsAreTests: false },
): Promise<DeleteDraftResult> {
    return db.transaction(async (tx) => {
        // Lock the competition, so nothing is entered while we check.
        const [competition] = await tx
            .select()
            .from(competitions)
            .where(eq(competitions.id, competitionId))
            .for('update')
        if (competition === undefined) {
            return { kind: 'noCompetition' } as const
        }

        if (competition.isDemo) {
            return { kind: 'demo' } as const
        }

        if (competition.status !== 'draft') {
            return { kind: 'notDraft' } as const
        }

        const entryRows = await tx
            .select({ id: entries.id })
            .from(entries)
            .where(eq(entries.competitionId, competitionId))
        const entryIds = entryRows.map((row) => {
            return row.id
        })

        const paymentRows = entryIds.length === 0
            ? []
            : await tx
                .select({
                    id: payments.id,
                    method: payments.method,
                    status: payments.status,
                    stripeSessionId: payments.stripeSessionId,
                })
                .from(payments)
                .where(inArray(payments.entryId, entryIds))
        const moved = paymentRows.filter((payment) => {
            return payment.status === 'paid' || payment.status === 'refunded'
        })
        const live = moved.filter((payment) => {
            return payment.method === 'stripe' && !isTestPayment(payment)
        })
        if (live.length > 0) {
            return { kind: 'liveMoney', paymentCount: live.length } as const
        }

        const manual = moved.filter((payment) => {
            return payment.method !== 'stripe'
        })
        if (manual.length > 0 && !options.manualPaymentsAreTests) {
            return { kind: 'manualMoney', paymentCount: manual.length } as const
        }

        if (paymentRows.length > 0) {
            await tx.delete(payments).where(inArray(payments.entryId, entryIds))
        }

        // The weeks, fixtures, teams, entries, picks and alerts go with it.
        await tx.delete(competitions).where(eq(competitions.id, competitionId))
        await recordAudit(tx, {
            actorEmail,
            action: 'competition.delete',
            targetType: 'competition',
            targetId: competitionId,
            before: {
                name: competition.name,
                season: competition.season,
                startMatchday: competition.startMatchday,
                entries: entryIds.length,
                payments: paymentRows.length,
            },
            reason,
        })

        return { kind: 'deleted', name: competition.name, entryCount: entryIds.length } as const
    })
}
