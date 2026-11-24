// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Decides what one tick should do to a competition, without touching the
// database. The runner (tick.ts) loads the state, calls this, and saves the
// result in one transaction.
//
//   1. Open the next week once the previous week's cut-off has passed
//      (Week 1 opens as soon as the competition is open). The cut-off is
//      fixed at that moment (Decision 12).
//   2. Auto-assign every locked week (rule 4). Safe to repeat.
//   3. Mark weeks settled once every player's outcome is final.
//   4. Move the competition status on: open → running at the Week 1
//      cut-off, running → finished when the competition has been won.

import { autoAssign, computeCutoff, computeStandings } from '@/engine'
import type { CompetitionOutcome, GameState, Pick } from '@/engine'

export type CompetitionStatus =
    | 'draft'
    | 'open'
    | 'running'
    | 'finished'

export interface TickWeek {
    readonly number: number
    readonly openedAt: Date | null
    readonly settledAt: Date | null
}

export interface TickInput {
    readonly state: GameState
    readonly weeks: readonly TickWeek[]
    readonly status: CompetitionStatus
    readonly now: Date
}

export interface WeekOpening {
    readonly weekNumber: number
    readonly cutoffAt: Date
}

export type TickAlert =
    | { readonly kind: 'autoPass'; readonly entryId: string; readonly weekNumber: number }
    | { readonly kind: 'weekWithoutFixtures'; readonly weekNumber: number }
    /** Nobody can pick for `weekNumber` until the week before it settles, and its cut-off is close or past. */
    | { readonly kind: 'weekBlocked'; readonly weekNumber: number; readonly cutoffAt: Date }
    /** The week was not opened: its cut-off would already be past, so it would lock the moment it opened. */
    | { readonly kind: 'cutoffInThePast'; readonly weekNumber: number; readonly cutoffAt: Date }
    /** Games with no result long after kick-off, whatever the reason: a feed problem, a mismatch, or a mapping. */
    | { readonly kind: 'resultsOverdue'; readonly weekNumber: number; readonly count: number }

export interface TickPlan {
    readonly openings: readonly WeekOpening[]
    readonly picks: readonly Pick[]
    readonly settledWeeks: readonly number[]
    readonly status: CompetitionStatus
    readonly alerts: readonly TickAlert[]
}

const ACTIVE: ReadonlySet<CompetitionStatus> = new Set(['open', 'running'])

/** An admin hears about a blocked week this long before its cut-off. */
const BLOCKED_WARNING_MS = 24 * 60 * 60 * 1000

/** A game is normally over in under 2 hours. After this long with no result, tell the admin. */
const RESULT_OVERDUE_MS = 4 * 60 * 60 * 1000

export function planTick(input: TickInput): TickPlan {
    if (!ACTIVE.has(input.status)) {
        return { openings: [], picks: [], settledWeeks: [], status: input.status, alerts: [] }
    }

    const alerts: TickAlert[] = []
    const opening = nextOpening(input, alerts)
    const state = opening === null ? input.state : withCutoff(input.state, opening)

    const picks: Pick[] = []
    let working = state
    for (const week of [...state.weeks].sort(byNumber)) {
        const assigned = autoAssign(working, input.now, week.number)
        if (assigned.length === 0) {
            continue
        }

        picks.push(...assigned)
        working = withPicks(working, assigned)
        for (const pick of assigned) {
            if (pick.source === 'autoPass') {
                alerts.push({ kind: 'autoPass', entryId: pick.entryId, weekNumber: pick.week })
            }
        }
    }

    const standings = computeStandings(working, input.now)
    alerts.push(...blockedWeekAlerts(working, standings.lastSettledWeek, input.now))
    alerts.push(...overdueResultAlerts(working, input.now))
    const settledWeeks = input.weeks
        .filter((week) => {
            return week.settledAt === null && week.number <= standings.lastSettledWeek
        })
        .map((week) => {
            return week.number
        })

    return {
        openings: opening === null ? [] : [opening],
        picks,
        settledWeeks,
        status: nextStatus(input, working, standings.outcome.kind),
        alerts,
    }
}

/**
 * Nobody can pick for a week until the week before it has settled. If a result is
 * held, every survivor is stuck, and the next cut-off is coming. Tell the admin
 * early, so they can settle the result by hand or move the cut-off. Only the
 * first blocked week counts: later ones follow from it.
 */
function blockedWeekAlerts(state: GameState, lastSettledWeek: number, now: Date): readonly TickAlert[] {
    const blocked = state.weeks.find((week) => {
        return week.number === lastSettledWeek + 2
    })
    if (blocked === undefined || blocked.cutoffAt === null) {
        return []
    }

    const isNear = blocked.cutoffAt.getTime() - now.getTime() <= BLOCKED_WARNING_MS
    return isNear ? [{ kind: 'weekBlocked', weekNumber: blocked.number, cutoffAt: blocked.cutoffAt }] : []
}

/**
 * Games with no result well after kick-off. This is the alert that would have
 * caught a feed that was working but never saving results: it does not depend
 * on why the result is missing. One alert per week.
 */
function overdueResultAlerts(state: GameState, now: Date): readonly TickAlert[] {
    const counts = new Map<number, number>()
    for (const fixture of state.fixtures) {
        const week = state.weeks.find((candidate) => {
            return candidate.number === fixture.week
        })
        const isWaiting = fixture.state.kind === 'scheduled' && fixture.override === undefined
        const isOverdue = now.getTime() - fixture.kickoffAt.getTime() >= RESULT_OVERDUE_MS
        if (week?.cutoffAt === null || week === undefined || !isWaiting || !isOverdue) {
            continue
        }

        counts.set(fixture.week, (counts.get(fixture.week) ?? 0) + 1)
    }

    return [...counts].map(([weekNumber, count]) => {
        return { kind: 'resultsOverdue', weekNumber, count } as const
    })
}

function nextOpening(input: TickInput, alerts: TickAlert[]): WeekOpening | null {
    const weeks = [...input.weeks].sort(byNumber)
    const next = weeks.find((week) => {
        return week.openedAt === null
    })
    if (next === undefined) {
        return null
    }

    const previous = input.state.weeks.find((week) => {
        return week.number === next.number - 1
    })
    const isPreviousLocked = previous?.cutoffAt !== null
        && previous?.cutoffAt !== undefined
        && input.now.getTime() >= previous.cutoffAt.getTime()
    if (next.number > 1 && !isPreviousLocked) {
        return null
    }

    const weekFixtures = input.state.fixtures.filter((fixture) => {
        return fixture.week === next.number
    })
    const cutoffAt = computeCutoff(weekFixtures, input.now)
    if (cutoffAt === null) {
        alerts.push({ kind: 'weekWithoutFixtures', weekNumber: next.number })
        return null
    }

    // The first game still to come is under an hour away, or the tick ran very late. Opening the
    // week now would lock it at once and pick for everyone. The admin sets the cut-off by hand.
    if (cutoffAt.getTime() <= input.now.getTime()) {
        alerts.push({ kind: 'cutoffInThePast', weekNumber: next.number, cutoffAt })
        return null
    }

    return { weekNumber: next.number, cutoffAt }
}

function nextStatus(input: TickInput, state: GameState, outcome: CompetitionOutcome['kind']): CompetitionStatus {
    const weekOneCutoff = state.weeks.find((week) => {
        return week.number === 1
    })?.cutoffAt ?? null
    const hasStarted = weekOneCutoff !== null && input.now.getTime() >= weekOneCutoff.getTime()

    // A won game is over. “No players” only ends the game once it has started.
    // Before the Week 1 cut-off nobody has entered yet, and finishing then
    // would close entries on a competition that is still waiting for its first player.
    if (outcome === 'won' || (outcome === 'noPlayers' && hasStarted)) {
        return 'finished'
    }

    if (input.status === 'open' && hasStarted) {
        return 'running'
    }

    return input.status
}

function withCutoff(state: GameState, opening: WeekOpening): GameState {
    return {
        ...state,
        weeks: state.weeks.map((week) => {
            return week.number === opening.weekNumber ? { ...week, cutoffAt: opening.cutoffAt } : week
        }),
    }
}

function withPicks(state: GameState, newPicks: readonly Pick[]): GameState {
    return {
        ...state,
        picks: [
            ...state.picks.filter((existing) => {
                return !newPicks.some((pick) => {
                    return pick.entryId === existing.entryId && pick.week === existing.week
                })
            }),
            ...newPicks,
        ],
    }
}

function byNumber(left: { readonly number: number }, right: { readonly number: number }): number {
    return left.number - right.number
}
