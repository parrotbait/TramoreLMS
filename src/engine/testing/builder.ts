// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Builds a GameState from a compact description. Used by the engine tests,
// and later by the simulator's scenario files.
//
// Week n starts on Saturday 7 Nov 2026 at 12:30 UTC plus (n - 1) weeks.
// Its cut-off is 1 hour before that. Fixture i kicks off i * 2 hours later.

import type {
    Entry,
    Fixture,
    FixtureOverride,
    FixtureState,
    GameState,
    Pick,
    PickOverride,
    Team,
    Verdict,
    Week,
} from '../types'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const WEEK_ONE_START_MS = Date.UTC(2026, 10, 7, 12, 30)

/**
 * Result codes:
 * - `'2-1'` finished with that score
 * - `'P'` postponed before the cut-off
 * - `'PL'` postponed after the cut-off (late)
 * - `'A'` abandoned, no result
 * - `'-'` or omitted: not played yet
 */
export type FixtureSpec = readonly [home: string, away: string, result?: string, override?: string]

export interface WeekSpec {
    readonly fixtures: readonly FixtureSpec[]
    /** Defaults to `true`. An unopened week has no cut-off yet. */
    readonly open?: boolean
}

export interface StateSpec {
    readonly weeks: readonly WeekSpec[]
    /** Defaults to 30, so the final-week rule only applies when a test asks for it. */
    readonly finalWeek?: number
    readonly entries: readonly string[]
    readonly boughtBack?: readonly string[]
    readonly withdrawn?: Readonly<Record<string, number>>
    /** Team name per week, starting at Week 1. `null` means no pick. */
    readonly picks?: Readonly<Record<string, readonly (string | null)[]>>
    readonly pickOverrides?: readonly (readonly [entry: string, week: number, outcome: Verdict])[]
    /** Teams with no fixture in any week. */
    readonly extraTeams?: readonly string[]
}

export function weekStart(weekNumber: number): Date {
    return new Date(WEEK_ONE_START_MS + (weekNumber - 1) * 7 * DAY_MS)
}

export function cutoffOf(weekNumber: number): Date {
    return new Date(weekStart(weekNumber).getTime() - HOUR_MS)
}

/** Two hours before the cut-off. Picks are open, and any `'P'` postponement has happened. */
export function beforeCutoff(weekNumber: number): Date {
    return new Date(cutoffOf(weekNumber).getTime() - 2 * HOUR_MS)
}

/** Three days after the week starts. Every match has been played. */
export function afterWeek(weekNumber: number): Date {
    return new Date(weekStart(weekNumber).getTime() + 3 * DAY_MS)
}

export function buildState(spec: StateSpec): GameState {
    const teamNames = new Set<string>(spec.extraTeams ?? [])
    const fixtures: Fixture[] = []
    const weeks: Week[] = []

    spec.weeks.forEach((weekSpec, index) => {
        const number = index + 1
        weeks.push({ number, cutoffAt: weekSpec.open === false ? null : cutoffOf(number) })

        weekSpec.fixtures.forEach(([home, away, result, override], fixtureIndex) => {
            teamNames.add(home)
            teamNames.add(away)
            fixtures.push({
                id: `w${number}-${home}-${away}`,
                week: number,
                homeTeamId: home,
                awayTeamId: away,
                kickoffAt: new Date(weekStart(number).getTime() + fixtureIndex * 2 * HOUR_MS),
                state: parseResult(result, number),
                ...(override === undefined ? {} : { override: parseOverride(override) }),
            })
        })
    })

    const teams: Team[] = [...teamNames].map((name) => {
        return { id: name, fullName: name }
    })

    const boughtBack = new Set(spec.boughtBack ?? [])
    const entries: Entry[] = spec.entries.map((id) => {
        const withdrawnFromWeek = spec.withdrawn?.[id]
        return {
            id,
            boughtBack: boughtBack.has(id),
            ...(withdrawnFromWeek === undefined ? {} : { withdrawnFromWeek }),
        }
    })

    const picks: Pick[] = []
    for (const [entryId, teamsByWeek] of Object.entries(spec.picks ?? {})) {
        teamsByWeek.forEach((teamId, index) => {
            if (teamId === null) {
                return
            }

            picks.push({ entryId, week: index + 1, teamId, source: 'player' })
        })
    }

    const pickOverrides: PickOverride[] = (spec.pickOverrides ?? []).map(([entryId, week, outcome]) => {
        return { entryId, week, outcome }
    })

    return {
        teams,
        weeks,
        finalWeek: spec.finalWeek ?? 30,
        fixtures,
        entries,
        picks,
        pickOverrides,
    }
}

/** Saves picks the way the database would: one pick per entry per week. */
export function withPicks(state: GameState, newPicks: readonly Pick[]): GameState {
    const replaced = state.picks.filter((existing) => {
        return !newPicks.some((pick) => {
            return pick.entryId === existing.entryId && pick.week === existing.week
        })
    })

    return { ...state, picks: [...replaced, ...newPicks] }
}

function parseResult(result: string | undefined, weekNumber: number): FixtureState {
    switch (result) {
        case undefined:
        case '-':
            return { kind: 'scheduled' }
        case 'P':
            return { kind: 'postponed', at: new Date(cutoffOf(weekNumber).getTime() - DAY_MS) }
        case 'PL':
            return { kind: 'postponed', at: new Date(cutoffOf(weekNumber).getTime() + 30 * 60 * 1000) }
        case 'A':
            return { kind: 'abandoned' }
        default:
            break
    }

    const score = parseScore(result)
    return { kind: 'finished', home: score.home, away: score.away }
}

function parseOverride(override: string): FixtureOverride {
    if (override === 'V') {
        return { kind: 'void' }
    }

    const score = parseScore(override)
    return { kind: 'result', home: score.home, away: score.away }
}

function parseScore(text: string): { home: number; away: number } {
    const match = /^(\d+)-(\d+)$/.exec(text)
    if (match === null) {
        throw new Error(`Not a score: ${text}`)
    }

    return { home: Number(match[1]), away: Number(match[2]) }
}
