// Created by Claude driven by Eddie Long on 2026-11-04.
//
// What the public pages (home and rules) show about the competition. The
// one taking entries comes first. If none is, the newest one that has
// started. Drafts are never shown. Server only.

import { and, asc, desc, eq, inArray } from 'drizzle-orm'

import { moneyTotals } from '@/admin/money'
import type { Executor } from '@/db/load'
import { competitions, entries, payments, teams, weeks } from '@/db/schema'
import { openCompetitionForEntries } from '@/payments/service'

export interface PublicCompetition {
    readonly name: string
    readonly entryFeeCents: number
    readonly buybackFeeCents: number
    readonly prizeCents: number
    readonly isTakingEntries: boolean
    readonly nextCutoff: { readonly weekNumber: number; readonly at: Date } | null
    /** Only when the admin turns on “show raised”, and only once it is above zero. */
    readonly raisedCents: number | null
    readonly teamNames: readonly string[]
}

export async function loadPublicCompetition(db: Executor, now: Date): Promise<PublicCompetition | null> {
    const open = await openCompetitionForEntries(db, now)
    const [competition] = open === null
        ? await db
            .select()
            .from(competitions)
            .where(inArray(competitions.status, ['open', 'running', 'finished']))
            .orderBy(desc(competitions.createdAt))
            .limit(1)
        : await db.select().from(competitions).where(eq(competitions.id, open.id))
    if (competition === undefined) {
        return null
    }

    const [weekRows, teamRows] = await Promise.all([
        db.select({ number: weeks.number, cutoffAt: weeks.cutoffAt })
            .from(weeks)
            .where(eq(weeks.competitionId, competition.id))
            .orderBy(asc(weeks.number)),
        db.select({ fullName: teams.fullName }).from(teams).where(eq(teams.competitionId, competition.id)),
    ])
    const next = weekRows.find((week) => {
        return week.cutoffAt !== null && week.cutoffAt.getTime() > now.getTime()
    })

    return {
        name: competition.name,
        entryFeeCents: competition.entryFeeCents,
        buybackFeeCents: competition.buybackFeeCents,
        prizeCents: competition.prizeCents,
        isTakingEntries: open !== null,
        nextCutoff: next?.cutoffAt === null || next?.cutoffAt === undefined
            ? null
            : { weekNumber: next.number, at: next.cutoffAt },
        raisedCents: competition.showRaised ? await raisedFor(db, competition.id, competition.prizeCents) : null,
        teamNames: teamRows.map((team) => {
            return team.fullName
        }),
    }
}

/** The same figure as “Raised for the club” on the admin dashboard. */
async function raisedFor(db: Executor, competitionId: string, prizeCents: number): Promise<number | null> {
    const rows = await db
        .select({
            kind: payments.kind,
            method: payments.method,
            status: payments.status,
            amountCents: payments.amountCents,
            feeCents: payments.feeCents,
        })
        .from(payments)
        .innerJoin(entries, eq(entries.id, payments.entryId))
        .where(and(eq(entries.competitionId, competitionId), eq(payments.status, 'paid')))
    const raised = moneyTotals(rows, prizeCents).netRaisedCents

    return raised > 0 ? raised : null
}
