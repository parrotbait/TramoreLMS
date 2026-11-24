// Created by Claude driven by Eddie Long on 2026-11-18.
//
// Tells the admins when a player joins. One email per player, sent when the
// entry becomes active: after a Stripe payment is confirmed, or when an admin
// adds a cash or Revolut player. Demos never take entries, so they send none.
//
// A failed email must never undo a sign-up, so this never throws. It logs
// instead, and the admin still sees the player on the Entries page.

import { and, eq, sql } from 'drizzle-orm'

import { parseAdminEmails } from '@/auth/rules'
import type { Database } from '@/db/client'
import { competitions, entries, people } from '@/db/schema'
import type { Mailer } from '@/email/mailer'
import { signUpEmail } from '@/email/templates'
import { formatEuro } from '@/lib/format'

export type SignUpMethod =
    | 'stripe'
    | 'cash'
    | 'revolut'
    | 'other'

const METHOD_LABELS: Readonly<Record<SignUpMethod, string>> = {
    stripe: 'card',
    cash: 'cash',
    revolut: 'Revolut',
    other: 'other means',
}

export interface SignUpNoticeEnvironment {
    readonly db: Database
    readonly mailer: Mailer
    readonly siteUrl: string
    /** ADMIN_EMAILS. Callers pass it, so tests never read the real one. */
    readonly adminEmails: string | undefined
}

/** Returns `true` if an email went out. */
export async function notifyAdminsOfSignUp(
    environment: SignUpNoticeEnvironment,
    signUp: { readonly entryId: string; readonly method: SignUpMethod; readonly amountCents: number },
): Promise<boolean> {
    try {
        const recipients = [...parseAdminEmails(environment.adminEmails)]
        if (recipients.length === 0) {
            return false
        }

        const { db, mailer, siteUrl } = environment
        const [entry] = await db
            .select({
                displayName: entries.displayName,
                email: people.email,
                competitionId: entries.competitionId,
                competitionName: competitions.name,
                isDemo: competitions.isDemo,
            })
            .from(entries)
            .innerJoin(competitions, eq(competitions.id, entries.competitionId))
            .innerJoin(people, eq(people.id, entries.personId))
            .where(eq(entries.id, signUp.entryId))
        if (entry === undefined || entry.isDemo) {
            return false
        }

        const [active] = await db
            .select({ total: sql<number>`count(*)::int` })
            .from(entries)
            .where(and(eq(entries.competitionId, entry.competitionId), eq(entries.status, 'active')))

        await mailer.send({
            to: recipients.join(', '),
            ...signUpEmail({
                displayName: entry.displayName,
                email: entry.email,
                competitionName: entry.competitionName,
                paidBy: METHOD_LABELS[signUp.method],
                amountLabel: formatEuro(signUp.amountCents),
                playerCount: active?.total ?? 1,
                entriesUrl: new URL(`/admin/c/${entry.competitionId}/entries`, siteUrl).toString(),
            }),
        })
    } catch (error) {
        console.error('Could not email the admins about a sign-up:', error)
        return false
    }

    return true
}
