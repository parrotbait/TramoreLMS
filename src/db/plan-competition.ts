// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Plans a new competition from the feed's season fixture list: the teams,
// one week per PL matchday from the start matchday to matchday 38, and the
// fixtures in each week. Pure. The writer in competitions.ts saves it.

import type { FeedMatch } from '@/feeds/types'
import { slug } from '@/lib/slug'

export interface PlannedTeam {
    readonly fullName: string
    readonly slug: string
}

export interface PlannedWeek {
    readonly number: number
    readonly plMatchday: number
}

export interface PlannedFixture {
    readonly weekNumber: number
    readonly homeSlug: string
    readonly awaySlug: string
    readonly kickoffAt: Date
    readonly externalId: number
}

export interface CompetitionPlan {
    readonly teams: readonly PlannedTeam[]
    readonly weeks: readonly PlannedWeek[]
    readonly fixtures: readonly PlannedFixture[]
}

export function planCompetition(
    matches: readonly FeedMatch[],
    startMatchday: number,
    finalMatchday = 38,
): CompetitionPlan {
    if (!Number.isInteger(startMatchday) || startMatchday < 1 || startMatchday > finalMatchday) {
        throw new Error(`The start matchday must be between 1 and ${finalMatchday}.`)
    }

    const names = [...new Set(matches.flatMap((match) => {
        return [match.home.name, match.away.name]
    }))].sort((left, right) => {
        return left.localeCompare(right, 'en')
    })

    const weeks: PlannedWeek[] = []
    for (let plMatchday = startMatchday; plMatchday <= finalMatchday; plMatchday += 1) {
        weeks.push({ number: plMatchday - startMatchday + 1, plMatchday })
    }

    const fixtures = matches
        .filter((match) => {
            return match.matchday !== null && match.matchday >= startMatchday && match.matchday <= finalMatchday
        })
        .map((match) => {
            return {
                weekNumber: (match.matchday ?? startMatchday) - startMatchday + 1,
                homeSlug: slug(match.home.name),
                awaySlug: slug(match.away.name),
                kickoffAt: match.kickoffAt,
                externalId: match.externalId,
            }
        })
        .sort((left, right) => {
            return left.weekNumber - right.weekNumber || left.kickoffAt.getTime() - right.kickoffAt.getTime()
        })

    return {
        teams: names.map((fullName) => {
            return { fullName, slug: slug(fullName) }
        }),
        weeks,
        fixtures,
    }
}

/**
 * Checks that every team plays exactly once in every week. The rules depend on
 * it: a team that has no game in a week cannot be picked, and a team with two
 * games would count twice. Returns one plain sentence per problem, or an empty
 * list when the schedule is right.
 */
export function scheduleProblems(plan: CompetitionPlan): readonly string[] {
    const nameOf = new Map(plan.teams.map((team) => {
        return [team.slug, team.fullName] as const
    }))
    const problems: string[] = []

    for (const week of plan.weeks) {
        const counts = new Map<string, number>()
        for (const fixture of plan.fixtures) {
            if (fixture.weekNumber !== week.number) {
                continue
            }

            for (const side of [fixture.homeSlug, fixture.awaySlug]) {
                counts.set(side, (counts.get(side) ?? 0) + 1)
            }
        }

        const label = `PL Matchday ${week.plMatchday}`
        for (const team of plan.teams) {
            const games = counts.get(team.slug) ?? 0
            if (games === 0) {
                problems.push(`${label}: ${nameOf.get(team.slug) ?? team.slug} has no game.`)
            } else if (games > 1) {
                problems.push(`${label}: ${nameOf.get(team.slug) ?? team.slug} plays ${games} games.`)
            }
        }
    }

    return problems
}

/** A short message for the admin, for example “PL Matchday 22: Leeds has no game. (and 2 more)”. */
export function describeScheduleProblems(problems: readonly string[]): string {
    const shown = problems.slice(0, 3).join(' ')
    const more = problems.length > 3 ? ` (and ${problems.length - 3} more)` : ''
    return `The fixture list is wrong, so the competition was not saved. ${shown}${more}`
}
