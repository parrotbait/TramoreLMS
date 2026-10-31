// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Saves a planned competition in one transaction.

import type { Database } from './client'
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
        }).returning({ id: competitions.id })
        if (competition === undefined) {
            throw new Error('Could not create the competition.')
        }

        const teamRows = await tx.insert(teams).values(plan.teams.map((team) => {
            return { competitionId: competition.id, fullName: team.fullName, slug: team.slug }
        })).returning({ id: teams.id, slug: teams.slug })
        const teamIdBySlug = new Map(teamRows.map((row) => {
            return [row.slug, row.id] as const
        }))

        const weekRows = await tx.insert(weeks).values(plan.weeks.map((week) => {
            return { competitionId: competition.id, number: week.number, plMatchday: week.plMatchday }
        })).returning({ id: weeks.id, number: weeks.number })
        const weekIdByNumber = new Map(weekRows.map((row) => {
            return [row.number, row.id] as const
        }))

        if (plan.fixtures.length > 0) {
            await tx.insert(fixtures).values(plan.fixtures.map((fixture) => {
                return {
                    competitionId: competition.id,
                    weekId: requireId(weekIdByNumber.get(fixture.weekNumber), `week ${fixture.weekNumber}`),
                    homeTeamId: requireId(teamIdBySlug.get(fixture.homeSlug), fixture.homeSlug),
                    awayTeamId: requireId(teamIdBySlug.get(fixture.awaySlug), fixture.awaySlug),
                    kickoffAt: fixture.kickoffAt,
                    externalId: fixture.externalId,
                }
            }))
        }

        return competition.id
    })
}

function requireId(id: string | undefined, what: string): string {
    if (id === undefined) {
        throw new Error(`The plan refers to an unknown ${what}.`)
    }

    return id
}
