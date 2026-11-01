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

export interface TickPlan {
    readonly openings: readonly WeekOpening[]
    readonly picks: readonly Pick[]
    readonly settledWeeks: readonly number[]
    readonly status: CompetitionStatus
    readonly alerts: readonly TickAlert[]
}

const ACTIVE: ReadonlySet<CompetitionStatus> = new Set(['open', 'running'])

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

    return { weekNumber: next.number, cutoffAt }
}

function nextStatus(input: TickInput, state: GameState, outcome: CompetitionOutcome['kind']): CompetitionStatus {
    if (outcome === 'won' || outcome === 'noPlayers') {
        return 'finished'
    }

    const weekOneCutoff = state.weeks.find((week) => {
        return week.number === 1
    })?.cutoffAt ?? null
    const hasStarted = weekOneCutoff !== null && input.now.getTime() >= weekOneCutoff.getTime()
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
