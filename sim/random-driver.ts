// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Drives a week with random but valid behaviour. Results follow team strength
// (sim/strength.ts), and players lean strongly towards favourites.

import { availableTeams, isEligibleForWeek, pickNeedsReplacing } from '@/engine'
import type { Fixture, TeamId } from '@/engine'

import type { FixtureSeed, SimCompetition } from './competition'
import type { Random } from './random'
import { randomScoreFor, winChance } from './strength'
import type { PickRequest, PlannedResult, WeekDriver } from './week'

/** Higher means players stick closer to the favourite. */
const FAVOURITE_BIAS = 4

export interface RandomOptions {
    /** Chance a player forgets to pick and gets auto-assigned. */
    readonly forgetRate: number
    /** Chance a player whose match was postponed early picks again. */
    readonly repickRate: number
    readonly earlyPostponementRate: number
    readonly latePostponementRate: number
    readonly abandonmentRate: number
}

export const defaultRandomOptions: RandomOptions = {
    forgetRate: 0.05,
    repickRate: 0.7,
    earlyPostponementRate: 0.01,
    latePostponementRate: 0.005,
    abandonmentRate: 0.002,
}

export function randomDriver(
    weekNumber: number,
    fixtures: readonly FixtureSeed[],
    random: Random,
    options: RandomOptions = defaultRandomOptions,
): WeekDriver {
    return {
        weekNumber,
        fixtures,
        picks: (competition, now) => {
            return choosePicks(competition, weekNumber, now, random, () => {
                return !random.chance(options.forgetRate)
            })
        },
        earlyPostponements: (weekFixtures) => {
            return weekFixtures
                .filter(() => {
                    return random.chance(options.earlyPostponementRate)
                })
                .map((fixture) => {
                    return fixture.id
                })
        },
        repicks: (competition, now) => {
            return choosePicks(competition, weekNumber, now, random, (entryId) => {
                const needsRepick = pickNeedsReplacing(competition.state, now, entryId, weekNumber)
                return needsRepick && random.chance(options.repickRate)
            })
        },
        results: (_competition, weekFixtures) => {
            return new Map(weekFixtures
                .filter((fixture) => {
                    return fixture.state.kind === 'scheduled'
                })
                .map((fixture) => {
                    return [fixture.id, randomResult(fixture, random, options)] as const
                }))
        },
    }
}

function randomResult(fixture: Fixture, random: Random, options: RandomOptions): PlannedResult {
    if (random.chance(options.latePostponementRate)) {
        return { kind: 'postponedLate' }
    }

    if (random.chance(options.abandonmentRate)) {
        return { kind: 'abandoned' }
    }

    const score = randomScoreFor(fixture, random)
    return { kind: 'score', primary: score, secondary: score }
}

function choosePicks(
    competition: SimCompetition,
    weekNumber: number,
    now: Date,
    random: Random,
    shouldPick: (entryId: string) => boolean,
): PickRequest[] {
    const state = competition.state
    const standings = competition.standings(now)
    const requests: PickRequest[] = []
    const weekFixtures = competition.fixturesOf(weekNumber)
    const chanceOf = (teamId: TeamId) => {
        const fixture = weekFixtures.find((candidate) => {
            return candidate.homeTeamId === teamId || candidate.awayTeamId === teamId
        })
        return fixture === undefined ? 0 : winChance(fixture, teamId)
    }

    for (const entry of state.entries) {
        if (!isEligibleForWeek(state, standings, entry.id, weekNumber) || !shouldPick(entry.id)) {
            continue
        }

        const options = availableTeams(state, standings, entry.id, weekNumber, now)
        if (options.length === 0) {
            continue
        }

        const choice = random.chooseWeighted(options, (team) => {
            return chanceOf(team.id) ** FAVOURITE_BIAS
        })
        requests.push({ entryId: entry.id, teamId: choice.id })
    }

    return requests
}

export function fixtureLabel(competition: SimCompetition, fixture: Fixture): string {
    return `${competition.teamName(fixture.homeTeamId)} v ${competition.teamName(fixture.awayTeamId)}`
}
