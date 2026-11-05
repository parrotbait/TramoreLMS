// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Saves a planned competition, and replaces a draft competition's schedule.

import { eq } from 'drizzle-orm'

import type { Database } from './client'
import type { Executor } from './load'
import type { CompetitionPlan } from './plan-competition'
import { competitions, fixtures, teams, weeks } from './schema'

export interface CompetitionSettings {
    readonly name: string
    readonly season: number
    readonly startMatchday: number
    readonly finalMatchday?: number
    readonly entryFeeCents?: number
    readonly buybackFeeCents?: number
    readonly prizeCents?: number
    readonly status?: 'draft' | 'open'
    /** A demo (src/demo). It never takes entries, and starts its clock here. */
    readonly demo?: { readonly now: Date }
}

export async function createCompetition(
    db: Database,
    settings: CompetitionSettings,
    plan: CompetitionPlan,
): Promise<string> {
    return db.transaction(async (tx) => {
        const [competition] = await tx.insert(competitions).values({
            name: settings.name,
            season: settings.season,
            startMatchday: settings.startMatchday,
            ...(settings.finalMatchday === undefined ? {} : { finalMatchday: settings.finalMatchday }),
            ...(settings.entryFeeCents === undefined ? {} : { entryFeeCents: settings.entryFeeCents }),
            ...(settings.buybackFeeCents === undefined ? {} : { buybackFeeCents: settings.buybackFeeCents }),
            ...(settings.prizeCents === undefined ? {} : { prizeCents: settings.prizeCents }),
            ...(settings.status === undefined ? {} : { status: settings.status, entriesOpen: settings.status === 'open' }),
            ...(settings.demo === undefined ? {} : { isDemo: true, demoNow: settings.demo.now, entriesOpen: false }),
        }).returning({ id: competitions.id })
        if (competition === undefined) {
            throw new Error('Could not create the competition.')
        }

        await replaceSchedule(tx, competition.id, plan)
        return competition.id
    })
}

/**
 * Writes the teams, weeks and fixtures for a competition, replacing any weeks
 * and fixtures already there. Only for a competition with no picks: a draft.
 * Teams are kept and matched by slug, so team ids stay stable.
 */
export async function replaceSchedule(db: Executor, competitionId: string, plan: CompetitionPlan) {
    await db.delete(weeks).where(eq(weeks.competitionId, competitionId))

    if (plan.teams.length > 0) {
        await db.insert(teams).values(plan.teams.map((team) => {
            return { competitionId, fullName: team.fullName, slug: team.slug }
        })).onConflictDoNothing()
    }

    const teamRows = await db
        .select({ id: teams.id, slug: teams.slug })
        .from(teams)
        .where(eq(teams.competitionId, competitionId))
    const teamIdBySlug = new Map(teamRows.map((row) => {
        return [row.slug, row.id] as const
    }))

    const weekRows = plan.weeks.length === 0
        ? []
        : await db.insert(weeks).values(plan.weeks.map((week) => {
            return { competitionId, number: week.number, plMatchday: week.plMatchday }
        })).returning({ id: weeks.id, number: weeks.number })
    const weekIdByNumber = new Map(weekRows.map((row) => {
        return [row.number, row.id] as const
    }))

    if (plan.fixtures.length > 0) {
        await db.insert(fixtures).values(plan.fixtures.map((fixture) => {
            return {
                competitionId,
                weekId: requireId(weekIdByNumber.get(fixture.weekNumber), `week ${fixture.weekNumber}`),
                homeTeamId: requireId(teamIdBySlug.get(fixture.homeSlug), fixture.homeSlug),
                awayTeamId: requireId(teamIdBySlug.get(fixture.awaySlug), fixture.awaySlug),
                kickoffAt: fixture.kickoffAt,
                externalId: fixture.externalId,
            }
        }))
    }
}

function requireId(id: string | undefined, what: string): string {
    if (id === undefined) {
        throw new Error(`The plan refers to an unknown ${what}.`)
    }

    return id
}
