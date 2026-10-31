// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Derives who is in, who is out and who has won from the game state.
// Standings are never stored. Reopening a week means calling this again.

import { isBuybackWindowOpen } from './buyback'
import { fixtureForTeam, resolveWeekFixtures, teamResult } from './fixtures'
import type {
    Entry,
    EntryId,
    Fixture,
    GameState,
    Pick,
    PickOverride,
    TeamId,
    Verdict,
    Week,
} from './types'

export type WeekReason =
    | 'awaitingCutoff'
    | 'awaitingPick'
    | 'awaitingResult'
    | 'win'
    | 'draw'
    | 'loss'
    | 'void'
    | 'pass'
    | 'pickOverride'

export interface EntryWeek {
    readonly week: number
    readonly pick: Pick | undefined
    readonly outcome: Verdict | 'pending'
    readonly reason: WeekReason
    /** Everyone still in went out together this week, so all of them stayed in (rule 6). */
    readonly reinstated: boolean
}

export type EntryStatus =
    | 'in'
    | 'provisionallyOut'
    | 'out'
    | 'winner'
    | 'withdrawn'

export interface EntryStanding {
    readonly entryId: EntryId
    readonly status: EntryStatus
    readonly eliminatedInWeek: number | null
    readonly weeks: readonly EntryWeek[]
}

export type CompetitionOutcome =
    | { readonly kind: 'running' }
    | { readonly kind: 'won'; readonly week: number; readonly winners: readonly EntryId[] }
    | { readonly kind: 'noPlayers' }

export interface Standings {
    readonly entries: ReadonlyMap<EntryId, EntryStanding>
    /** The last week whose outcomes are all final. `0` if none. */
    readonly lastSettledWeek: number
    readonly outcome: CompetitionOutcome
}

interface MutableStanding {
    entryId: EntryId
    status: EntryStatus
    eliminatedInWeek: number | null
    weeks: EntryWeek[]
}

type WeekResult = Omit<EntryWeek, 'reinstated'> & { readonly entryId: EntryId }

/** Lookups built once per call, so standings stay fast with hundreds of players. */
interface GameIndex {
    readonly picks: ReadonlyMap<string, Pick>
    readonly pickOverrides: ReadonlyMap<string, PickOverride>
    readonly fixturesByWeek: ReadonlyMap<number, readonly Fixture[]>
}

function entryWeekKey(entryId: EntryId, weekNumber: number): string {
    return `${weekNumber}:${entryId}`
}

function buildIndex(state: GameState): GameIndex {
    const fixturesByWeek = new Map<number, Fixture[]>()
    for (const fixture of state.fixtures) {
        const list = fixturesByWeek.get(fixture.week) ?? []
        list.push(fixture)
        fixturesByWeek.set(fixture.week, list)
    }

    return {
        picks: new Map(state.picks.map((pick) => {
            return [entryWeekKey(pick.entryId, pick.week), pick] as const
        })),
        pickOverrides: new Map(state.pickOverrides.map((override) => {
            return [entryWeekKey(override.entryId, override.week), override] as const
        })),
        fixturesByWeek,
    }
}

/** Teams an entry has used in weeks before `beforeWeek`. */
export function usedTeamIds(weeks: readonly EntryWeek[], beforeWeek: number): ReadonlySet<TeamId> {
    const used = new Set<TeamId>()

    for (const entryWeek of weeks) {
        const teamId = entryWeek.pick?.teamId
        if (entryWeek.week >= beforeWeek || teamId === undefined || teamId === null) {
            continue
        }

        used.add(teamId)
    }

    return used
}

export function computeStandings(state: GameState, now: Date): Standings {
    const records = new Map<EntryId, MutableStanding>()
    for (const entry of state.entries) {
        records.set(entry.id, { entryId: entry.id, status: 'in', eliminatedInWeek: null, weeks: [] })
    }

    const entriesById = new Map(state.entries.map((entry) => {
        return [entry.id, entry] as const
    }))
    const weeks = [...state.weeks]
        .filter((week) => {
            return week.number <= state.finalWeek
        })
        .sort((left, right) => {
            return left.number - right.number
        })

    const index = buildIndex(state)
    let alive: EntryId[] = state.entries.map((entry) => {
        return entry.id
    })
    let lastSettledWeek = 0

    for (const week of weeks) {
        alive = removeWithdrawn(alive, week.number, entriesById, records)
        if (alive.length === 0) {
            return { entries: records, lastSettledWeek, outcome: { kind: 'noPlayers' } }
        }

        const results = playWeek(index, week, alive, records, now)
        const isSettled = results.every((result) => {
            return result.outcome !== 'pending'
        })

        if (!isSettled) {
            recordUnsettledWeek(results, records)
            return { entries: records, lastSettledWeek, outcome: { kind: 'running' } }
        }

        lastSettledWeek = week.number
        const survivors = recordSettledWeek(week, results, entriesById, records)

        const isFinalWeek = week.number === state.finalWeek
        const isAwaitingBuybacks = week.number === 1 && isBuybackWindowOpen(state, now)
        const hasSingleSurvivor = survivors.length === 1 && !isAwaitingBuybacks

        if (isFinalWeek || hasSingleSurvivor) {
            for (const winner of survivors) {
                requireRecord(records, winner).status = 'winner'
            }
            return {
                entries: records,
                lastSettledWeek,
                outcome: { kind: 'won', week: week.number, winners: survivors },
            }
        }

        alive = survivors
    }

    return { entries: records, lastSettledWeek, outcome: { kind: 'running' } }
}

function removeWithdrawn(
    alive: readonly EntryId[],
    weekNumber: number,
    entriesById: ReadonlyMap<EntryId, Entry>,
    records: Map<EntryId, MutableStanding>,
): EntryId[] {
    return alive.filter((entryId) => {
        const withdrawnFromWeek = entriesById.get(entryId)?.withdrawnFromWeek
        if (withdrawnFromWeek === undefined || withdrawnFromWeek > weekNumber) {
            return true
        }

        requireRecord(records, entryId).status = 'withdrawn'
        return false
    })
}

function playWeek(
    index: GameIndex,
    week: Week,
    alive: readonly EntryId[],
    records: ReadonlyMap<EntryId, MutableStanding>,
    now: Date,
): WeekResult[] {
    const isLocked = week.cutoffAt !== null && now.getTime() >= week.cutoffAt.getTime()
    const weekFixtures = index.fixturesByWeek.get(week.number) ?? []
    const resolutions = resolveWeekFixtures(week, weekFixtures)

    return alive.map((entryId): WeekResult => {
        const pick = index.picks.get(entryWeekKey(entryId, week.number))
        const base = { entryId, week: week.number, pick }

        if (!isLocked) {
            return { ...base, outcome: 'pending', reason: 'awaitingCutoff' }
        }

        const override = index.pickOverrides.get(entryWeekKey(entryId, week.number))
        if (override !== undefined) {
            return { ...base, outcome: override.outcome, reason: 'pickOverride' }
        }

        if (pick === undefined) {
            return { ...base, outcome: 'pending', reason: 'awaitingPick' }
        }

        if (pick.teamId === null) {
            const isPass = pick.source === 'autoPass'
            return isPass
                ? { ...base, outcome: 'through', reason: 'pass' }
                : { ...base, outcome: 'pending', reason: 'awaitingPick' }
        }

        const used = usedTeamIds(requireRecord(records, entryId).weeks, week.number)
        const fixture = fixtureForTeam(weekFixtures, pick.teamId)
        if (used.has(pick.teamId) || fixture === undefined) {
            return { ...base, outcome: 'pending', reason: 'awaitingPick' }
        }

        const resolution = resolutions.get(fixture.id) ?? { kind: 'pending' }
        switch (teamResult(resolution, fixture, pick.teamId)) {
            case 'win':
                return { ...base, outcome: 'through', reason: 'win' }
            case 'void':
                return { ...base, outcome: 'through', reason: 'void' }
            case 'draw':
                return { ...base, outcome: 'out', reason: 'draw' }
            case 'loss':
                return { ...base, outcome: 'out', reason: 'loss' }
            case 'removed':
                return { ...base, outcome: 'pending', reason: 'awaitingPick' }
            case 'pending':
                return { ...base, outcome: 'pending', reason: 'awaitingResult' }
        }
    })
}

/** "Through" is final at once. "Out" is provisional, because everyone may go out together. */
function recordUnsettledWeek(results: readonly WeekResult[], records: Map<EntryId, MutableStanding>) {
    for (const result of results) {
        const record = requireRecord(records, result.entryId)
        record.weeks.push(toEntryWeek(result, false))

        if (result.outcome === 'out') {
            record.status = 'provisionallyOut'
        }
    }
}

/** Records a settled week and returns the entries that carry on. */
function recordSettledWeek(
    week: Week,
    results: readonly WeekResult[],
    entriesById: ReadonlyMap<EntryId, Entry>,
    records: Map<EntryId, MutableStanding>,
): EntryId[] {
    const through = results.filter((result) => {
        return result.outcome === 'through'
    })
    const isEveryoneOut = through.length === 0

    for (const result of results) {
        requireRecord(records, result.entryId).weeks.push(toEntryWeek(result, isEveryoneOut))
    }

    if (isEveryoneOut) {
        return results.map((result) => {
            return result.entryId
        })
    }

    const survivors = through.map((result) => {
        return result.entryId
    })

    for (const result of results) {
        if (result.outcome !== 'out') {
            continue
        }

        const isBoughtBack = week.number === 1 && entriesById.get(result.entryId)?.boughtBack === true
        if (isBoughtBack) {
            survivors.push(result.entryId)
            continue
        }

        const record = requireRecord(records, result.entryId)
        record.status = 'out'
        record.eliminatedInWeek = week.number
    }

    return survivors
}

function toEntryWeek(result: WeekResult, reinstated: boolean): EntryWeek {
    return {
        week: result.week,
        pick: result.pick,
        outcome: result.outcome,
        reason: result.reason,
        reinstated,
    }
}

function requireRecord(records: ReadonlyMap<EntryId, MutableStanding>, entryId: EntryId): MutableStanding {
    const record = records.get(entryId)
    if (record === undefined) {
        throw new Error(`No standing for entry ${entryId}`)
    }

    return record
}
