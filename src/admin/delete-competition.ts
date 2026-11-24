// Created by Claude driven by Eddie Long on 2026-11-24.
//
// Deleting a draft competition, for example one used for testing.
//
// An empty draft can always go. A draft with entries can go only if none of its
// payments is real money. Stripe test payments (session ids that start with
// “cs_test_”) are not real money. Cash, Revolut and live Stripe payments are.
// If any exist, nothing is deleted, as the treasurer needs that record.

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
    /** Real money was taken, so the record must stay. */
    | { readonly kind: 'realMoney'; readonly paymentCount: number }

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
                .select({ id: payments.id, method: payments.method, stripeSessionId: payments.stripeSessionId })
                .from(payments)
                .where(inArray(payments.entryId, entryIds))
        const realPayments = paymentRows.filter((payment) => {
            return !isTestPayment(payment)
        })
        if (realPayments.length > 0) {
            return { kind: 'realMoney', paymentCount: realPayments.length } as const
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
                testPayments: paymentRows.length,
            },
            reason,
        })

        return { kind: 'deleted', name: competition.name, entryCount: entryIds.length } as const
    })
}
