// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Rule 3: a Week 1 loser can buy back in until the Week 2 cut-off.

import type { Standings } from './standings'
import type { EntryId, GameState } from './types'

/** Open until the Week 2 cut-off. Open while Week 2 has no cut-off yet. */
export function isBuybackWindowOpen(state: GameState, now: Date): boolean {
    const weekTwo = state.weeks.find((week) => {
        return week.number === 2
    })

    if (weekTwo === undefined || weekTwo.cutoffAt === null) {
        return true
    }

    return now.getTime() < weekTwo.cutoffAt.getTime()
}

export function isBuybackAvailable(
    state: GameState,
    standings: Standings,
    now: Date,
    entryId: EntryId,
): boolean {
    const entry = state.entries.find((candidate) => {
        return candidate.id === entryId
    })
    if (entry === undefined || entry.boughtBack || entry.withdrawnFromWeek !== undefined) {
        return false
    }

    const weekOne = standings.entries.get(entryId)?.weeks.find((entryWeek) => {
        return entryWeek.week === 1
    })
    const isWeekOneLoser = standings.lastSettledWeek >= 1
        && weekOne !== undefined
        && weekOne.outcome === 'out'
        && !weekOne.reinstated
    if (!isWeekOneLoser) {
        return false
    }

    return isBuybackWindowOpen(state, now)
}
