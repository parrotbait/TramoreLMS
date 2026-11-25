// Created by Claude driven by Eddie Long on 2026-11-25.
//
// Removes every player from the database, for clearing out test data. It keeps
// the competitions, weeks, fixtures and teams, and the people on the keep list
// (the admins). Everything a player owns goes with them: entries, payments,
// picks, overrides, reminder records, sessions and sign-in links.
//
// Real money is protected, in the same way as deleting a competition.
//   - Live Stripe payments always stop it.
//   - Cash, Revolut and other hand-added payments stop it, unless the caller says they were tests.
// A dry run counts what would go and changes nothing.

import { inArray, notInArray, sql } from 'drizzle-orm'

import type { Database } from '@/db/client'
import { entries, payments, people } from '@/db/schema'

import { recordAudit } from './audit'
import { isTestPayment } from './delete-competition'

export interface WipeOptions {
    /** Lower-case emails to keep. Admins. */
    readonly keepEmails: readonly string[]
    /** The caller says any cash or Revolut payments were only tests. */
    readonly manualPaymentsAreTests: boolean
    /** `false` counts and changes nothing. */
    readonly execute: boolean
    readonly actorEmail: string
}

export interface WipeCounts {
    readonly people: number
    readonly entries: number
    readonly payments: number
}

export type WipeResult =
    | { readonly kind: 'dryRun'; readonly counts: WipeCounts }
    | { readonly kind: 'wiped'; readonly counts: WipeCounts }
    | { readonly kind: 'liveMoney'; readonly paymentCount: number }
    | { readonly kind: 'manualMoney'; readonly paymentCount: number }

export async function wipePlayers(db: Database, options: WipeOptions): Promise<WipeResult> {
    return db.transaction(async (tx) => {
        const paymentRows = await tx
            .select({
                id: payments.id,
                method: payments.method,
                status: payments.status,
                stripeSessionId: payments.stripeSessionId,
            })
            .from(payments)
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

        const keep = options.keepEmails
        const toRemove = keep.length === 0
            ? await tx.select({ id: people.id }).from(people)
            : await tx.select({ id: people.id }).from(people).where(notInArray(people.email, [...keep]))
        const entryRows = await tx.select({ id: entries.id }).from(entries)
        const counts: WipeCounts = {
            people: toRemove.length,
            entries: entryRows.length,
            payments: paymentRows.length,
        }
        if (!options.execute) {
            return { kind: 'dryRun', counts } as const
        }

        // Payments have no cascade from entries, so they go first. Entries then take their
        // picks, overrides and reminder records with them. People take their sessions and links.
        await tx.delete(payments).where(sql`true`)
        await tx.delete(entries).where(sql`true`)
        if (toRemove.length > 0) {
            await tx.delete(people).where(inArray(people.id, toRemove.map((person) => {
                return person.id
            })))
        }

        await recordAudit(tx, {
            actorEmail: options.actorEmail,
            action: 'players.wipe',
            targetType: 'database',
            targetId: 'all-players',
            before: counts,
            after: { keptEmails: keep.length },
            reason: 'Cleared test players',
        })

        return { kind: 'wiped', counts } as const
    })
}
