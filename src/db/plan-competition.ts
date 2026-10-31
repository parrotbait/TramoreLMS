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
