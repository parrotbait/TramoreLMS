// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Pick validation and auto-assign (rules 2 and 4, Decision 8).

import { isPostponedBy } from './fixtures'
import { computeStandings, usedTeamIds } from './standings'
import type { Standings } from './standings'
import type {
    EntryId,
    GameState,
    Pick,
    Team,
    TeamId,
} from './types'

export type PickRejection =
    | 'unknownWeek'
    | 'weekNotOpen'
    | 'cutoffPassed'
    | 'notEligible'
    | 'teamUsed'
    | 'teamNotAvailable'

export type PickValidation =
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: PickRejection }

/**
 * True when the entry is in for this week.
 *
 * A player is also in for next week as soon as their own result for this week
 * is "through", before the rest of the week settles (Decision 20).
 */
export function isEligibleForWeek(
    state: GameState,
    standings: Standings,
    entryId: EntryId,
    weekNumber: number,
): boolean {
    if (standings.outcome.kind !== 'running') {
        return false
    }

    const entry = state.entries.find((candidate) => {
        return candidate.id === entryId
    })
    const standing = standings.entries.get(entryId)
    if (entry === undefined || standing === undefined) {
        return false
    }

    const isWithdrawn = entry.withdrawnFromWeek !== undefined && entry.withdrawnFromWeek <= weekNumber
    if (isWithdrawn) {
        return false
    }

    const isAlreadyIn = standing.weeks.some((entryWeek) => {
        return entryWeek.week === weekNumber
    })
    if (isAlreadyIn) {
        return true
    }

    const previous = standing.weeks.find((entryWeek) => {
        return entryWeek.week === weekNumber - 1
    })

    return previous?.outcome === 'through'
}

/**
 * Teams the entry could pick this week, in auto-assign order.
 *
 * A team is available when the entry has not used it and it has a fixture this
 * week that was not postponed before `asOf`.
 */
export function availableTeams(
    state: GameState,
    standings: Standings,
    entryId: EntryId,
    weekNumber: number,
    asOf: Date,
): readonly Team[] {
    const weeks = standings.entries.get(entryId)?.weeks ?? []
    const used = usedTeamIds(weeks, weekNumber)
    const playing = new Set<TeamId>()

    for (const fixture of state.fixtures) {
        if (fixture.week !== weekNumber || isPostponedBy(fixture, asOf)) {
            continue
        }

        playing.add(fixture.homeTeamId)
        playing.add(fixture.awayTeamId)
    }

    return state.teams
        .filter((team) => {
            return playing.has(team.id) && !used.has(team.id)
        })
        .sort(byFullName)
}

export function validatePick(
    state: GameState,
    now: Date,
    entryId: EntryId,
    weekNumber: number,
    teamId: TeamId,
): PickValidation {
    const week = state.weeks.find((candidate) => {
        return candidate.number === weekNumber
    })
    if (week === undefined) {
        return { ok: false, reason: 'unknownWeek' }
    }

    if (week.cutoffAt === null) {
        return { ok: false, reason: 'weekNotOpen' }
    }

    if (now.getTime() >= week.cutoffAt.getTime()) {
        return { ok: false, reason: 'cutoffPassed' }
    }

    const standings = computeStandings(state, now)
    if (!isEligibleForWeek(state, standings, entryId, weekNumber)) {
        return { ok: false, reason: 'notEligible' }
    }

    const weeks = standings.entries.get(entryId)?.weeks ?? []
    if (usedTeamIds(weeks, weekNumber).has(teamId)) {
        return { ok: false, reason: 'teamUsed' }
    }

    const isAvailable = availableTeams(state, standings, entryId, weekNumber, now).some((team) => {
        return team.id === teamId
    })
    if (!isAvailable) {
        return { ok: false, reason: 'teamNotAvailable' }
    }

    return { ok: true }
}

/**
 * True when the entry's current pick is no longer valid, for example because
 * the match was postponed before the cut-off. The player must pick again.
 */
export function pickNeedsReplacing(
    state: GameState,
    now: Date,
    entryId: EntryId,
    weekNumber: number,
): boolean {
    const pick = findPick(state, entryId, weekNumber)
    if (pick === undefined || pick.teamId === null) {
        return false
    }

    const standings = computeStandings(state, now)
    const isStillAvailable = availableTeams(state, standings, entryId, weekNumber, now).some((team) => {
        return team.id === pick.teamId
    })

    return !isStillAvailable
}

/**
 * Rule 4. Returns the picks to save for entries with no valid pick at the cut-off.
 *
 * Safe to run any number of times. Valid picks are left alone, so a second run
 * returns nothing new. Entries that become eligible later, for example when
 * the previous week settles after this cut-off, are assigned on a later run.
 */
export function autoAssign(state: GameState, now: Date, weekNumber: number): readonly Pick[] {
    const week = state.weeks.find((candidate) => {
        return candidate.number === weekNumber
    })
    const cutoffAt = week?.cutoffAt ?? null
    if (cutoffAt === null || now.getTime() < cutoffAt.getTime()) {
        return []
    }

    const standings = computeStandings(state, now)
    const assigned: Pick[] = []

    for (const entry of state.entries) {
        if (!isEligibleForWeek(state, standings, entry.id, weekNumber)) {
            continue
        }

        const hasOverride = state.pickOverrides.some((override) => {
            return override.entryId === entry.id && override.week === weekNumber
        })
        const existing = findPick(state, entry.id, weekNumber)
        if (hasOverride || existing?.source === 'autoPass') {
            continue
        }

        const available = availableTeams(state, standings, entry.id, weekNumber, cutoffAt)
        const isExistingValid = available.some((team) => {
            return team.id === existing?.teamId
        })
        if (isExistingValid) {
            continue
        }

        const first = available[0]
        assigned.push(first === undefined
            ? { entryId: entry.id, week: weekNumber, teamId: null, source: 'autoPass' }
            : { entryId: entry.id, week: weekNumber, teamId: first.id, source: 'auto' })
    }

    return assigned
}

function findPick(state: GameState, entryId: EntryId, weekNumber: number): Pick | undefined {
    return state.picks.find((pick) => {
        return pick.entryId === entryId && pick.week === weekNumber
    })
}

function byFullName(left: Team, right: Team): number {
    return compareTeamNames(left.fullName, right.fullName)
}

/** The auto-pick order: alphabetical by full club name, ignoring case and accents (Decision 8). */
export function compareTeamNames(left: string, right: string): number {
    return left.localeCompare(right, 'en', { sensitivity: 'base' })
}
