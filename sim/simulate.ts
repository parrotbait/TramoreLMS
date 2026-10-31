// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Plays a whole season. Shared by the CLI and the soak test.

import type { Standings } from '@/engine'

import { SimCompetition } from './competition'
import type { FixtureSeed } from './competition'
import { Random } from './random'
import { randomDriver } from './random-driver'
import { playerNames } from './season'
import type { Season } from './season'
import { playWeek } from './week'
import type { WeekDriver, WeekLog } from './week'

export interface SeasonOptions {
    readonly season: Season
    readonly players: number
    readonly startMatchday: number
    readonly seed: number
    readonly makeDriver?: (weekNumber: number, fixtures: readonly FixtureSeed[], random: Random) => WeekDriver
    readonly onWeek?: (competition: SimCompetition, log: WeekLog, standings: Standings, plMatchday: number) => void
}

export interface SeasonResult {
    readonly competition: SimCompetition
    readonly logs: readonly WeekLog[]
    readonly standings: Standings
}

export async function simulateSeason(options: SeasonOptions): Promise<SeasonResult> {
    const random = new Random(options.seed)
    const finalWeek = 38 - options.startMatchday + 1
    const competition = new SimCompetition(options.season.teams, playerNames(options.players, random), finalWeek)
    const makeDriver = options.makeDriver ?? randomDriver
    const logs: WeekLog[] = []
    let previousAfterAt: Date | null = null

    for (let weekNumber = 1; weekNumber <= finalWeek; weekNumber += 1) {
        const plMatchday = options.startMatchday + weekNumber - 1
        const fixtures = options.season.matchdays[plMatchday - 1]?.fixtures ?? []
        const log = await playWeek(competition, makeDriver(weekNumber, fixtures, random), previousAfterAt)
        const standings = competition.standings(log.afterAt)

        logs.push(log)
        options.onWeek?.(competition, log, standings, plMatchday)
        previousAfterAt = log.afterAt

        if (standings.outcome.kind !== 'running') {
            break
        }
    }

    const endAt = new Date((previousAfterAt ?? new Date()).getTime() + 1)
    return { competition, logs, standings: competition.standings(endAt) }
}
