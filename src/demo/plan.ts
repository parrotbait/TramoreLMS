// Created by Claude driven by Eddie Long on 2026-11-04.
//
// The demo's rules, without touching the database. Pure, so it is tested.
// The demo uses the real rules engine. Only the clock, the bots and the
// results are made up.
//
// Next step moves the demo through each week like this:
//
//   picking      → 3 hours before the cut-off (the countdown shows)
//   final hours  → just after the cut-off: auto-picks run, picks show,
//                  and the next week opens
//   locked       → the games are played: random results by team strength,
//                  and the bots pick for the next week
//
// After the last week, or once someone has won, the demo is over.

import { availableTeams, isEligibleForWeek } from '@/engine'
import type { Fixture, GameState, Pick, Standings } from '@/engine'

import type { Random } from '../../sim/random'
import type { CachedMatch } from '../../sim/season-cache'
import { randomScoreFor, winChance } from '../../sim/strength'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export const DEMO_BOTS = 20
export const DEMO_WEEKS = 10
/** Bots that forget to pick, so the auto-pick shows. */
const FORGET_RATE = 0.1
/** Higher means bots stick closer to the favourite. */
const FAVOURITE_BIAS = 4

export interface DemoWeek {
    readonly number: number
    readonly cutoffAt: Date | null
    readonly settledAt: Date | null
}

export type DemoStage =
    | { readonly kind: 'picking'; readonly weekNumber: number; readonly cutoffAt: Date; readonly isFinalHours: boolean }
    | { readonly kind: 'locked'; readonly weekNumber: number }
    | { readonly kind: 'over' }

/** Where the demo is: the earliest open week that hasn't settled. */
export function demoStage(weeks: readonly DemoWeek[], standings: Standings, now: Date): DemoStage {
    if (standings.outcome.kind !== 'running') {
        return { kind: 'over' }
    }

    const current = [...weeks]
        .sort((left, right) => {
            return left.number - right.number
        })
        .find((week) => {
            return week.cutoffAt !== null && week.settledAt === null
        })
    if (current?.cutoffAt === null || current?.cutoffAt === undefined) {
        return { kind: 'over' }
    }

    if (now.getTime() >= current.cutoffAt.getTime()) {
        return { kind: 'locked', weekNumber: current.number }
    }

    return {
        kind: 'picking',
        weekNumber: current.number,
        cutoffAt: current.cutoffAt,
        isFinalHours: current.cutoffAt.getTime() - now.getTime() <= 3 * HOUR_MS,
    }
}

/** What the Next step button says. */
export function nextStepLabel(stage: DemoStage): string | null {
    switch (stage.kind) {
        case 'picking':
            return stage.isFinalHours ? 'Close picks (pass the cut-off)' : 'Go to 3 hours before the cut-off'
        case 'locked':
            return `Play the Week ${stage.weekNumber} games`
        case 'over':
            return null
    }
}

/** The demo clock for the picking steps. */
export function pickingClock(stage: Extract<DemoStage, { kind: 'picking' }>): Date {
    return stage.isFinalHours
        ? new Date(stage.cutoffAt.getTime() + MINUTE_MS)
        : new Date(stage.cutoffAt.getTime() - 3 * HOUR_MS)
}

/** The demo clock once a week's games are played: 2 hours after the last kick-off. */
export function afterGamesClock(weekFixtures: readonly Fixture[], now: Date): Date {
    const lastKickoff = Math.max(now.getTime(), ...weekFixtures.map((fixture) => {
        return fixture.kickoffAt.getTime()
    }))

    return new Date(lastKickoff + 2 * HOUR_MS)
}

/**
 * Random results by team strength, for games still to play. Games with an
 * admin override keep it, so the admin can steer the story.
 */
export function demoResults(
    weekFixtures: readonly Fixture[],
    slugOf: (teamId: string) => string,
    random: Random,
): ReadonlyMap<string, { readonly home: number; readonly away: number }> {
    return new Map(weekFixtures
        .filter((fixture) => {
            return fixture.state.kind === 'scheduled' && fixture.override === undefined
        })
        .map((fixture) => {
            return [fixture.id, randomScoreFor(bySlug(fixture, slugOf), random)] as const
        }))
}

/** Bot picks for a week: favourites mostly, and a few forget. */
export function botPicks(
    state: GameState,
    standings: Standings,
    botIds: ReadonlySet<string>,
    weekNumber: number,
    now: Date,
    slugOf: (teamId: string) => string,
    random: Random,
): readonly Pick[] {
    const weekFixtures = state.fixtures.filter((fixture) => {
        return fixture.week === weekNumber
    })
    const chanceOf = (teamId: string) => {
        const fixture = weekFixtures.find((candidate) => {
            return candidate.homeTeamId === teamId || candidate.awayTeamId === teamId
        })
        return fixture === undefined ? 0 : winChance(bySlug(fixture, slugOf), slugOf(teamId))
    }

    const picks: Pick[] = []
    for (const entry of state.entries) {
        const hasPicked = state.picks.some((pick) => {
            return pick.entryId === entry.id && pick.week === weekNumber
        })
        const canPick = botIds.has(entry.id) && !hasPicked && isEligibleForWeek(state, standings, entry.id, weekNumber)
        if (!canPick || random.chance(FORGET_RATE)) {
            continue
        }

        const options = availableTeams(state, standings, entry.id, weekNumber, now)
        if (options.length === 0) {
            continue
        }

        const choice = random.chooseWeighted(options, (team) => {
            return chanceOf(team.id) ** FAVOURITE_BIAS
        })
        picks.push({ entryId: entry.id, week: weekNumber, teamId: choice.id, source: 'player' })
    }

    return picks
}

export interface DemoFixturePlan {
    readonly weekNumber: number
    readonly plMatchday: number
    readonly home: string
    readonly away: string
    readonly kickoffAt: Date
}

/**
 * The first matchday that starts at least 2 days from now, so the demo feels
 * like this coming weekend. If the cached season is over, it starts at 1.
 */
export function demoStartMatchday(matches: readonly CachedMatch[], realNow: Date): number {
    const lastStart = 39 - DEMO_WEEKS
    for (let matchday = 1; matchday <= lastStart; matchday += 1) {
        const first = Math.min(...matches
            .filter((match) => {
                return match.matchday === matchday
            })
            .map((match) => {
                return Date.parse(match.utcDate)
            }))
        if (Number.isFinite(first) && first - realNow.getTime() >= 2 * DAY_MS) {
            return matchday
        }
    }

    return 1
}

/**
 * The demo's fixtures from the cached real season. A match rearranged to
 * more than 4 days after its matchday starts is left out, as the simulator
 * does.
 */
export function demoFixtures(matches: readonly CachedMatch[], startMatchday: number): readonly DemoFixturePlan[] {
    const fixtures: DemoFixturePlan[] = []
    for (let weekNumber = 1; weekNumber <= DEMO_WEEKS; weekNumber += 1) {
        const plMatchday = startMatchday + weekNumber - 1
        const ofMatchday = matches.filter((match) => {
            return match.matchday === plMatchday
        })
        const first = Math.min(...ofMatchday.map((match) => {
            return Date.parse(match.utcDate)
        }))

        for (const match of ofMatchday) {
            if (Date.parse(match.utcDate) - first > 4 * DAY_MS) {
                continue
            }

            fixtures.push({
                weekNumber,
                plMatchday,
                home: match.home,
                away: match.away,
                kickoffAt: new Date(match.utcDate),
            })
        }
    }

    return fixtures
}

/** The strength tables use team slugs. The database uses ids. */
function bySlug(fixture: Fixture, slugOf: (teamId: string) => string): Fixture {
    return { ...fixture, homeTeamId: slugOf(fixture.homeTeamId), awayTeamId: slugOf(fixture.awayTeamId) }
}
