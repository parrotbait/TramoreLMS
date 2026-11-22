// Created by Claude driven by Eddie Long on 2026-11-22.
//
// Next week can only be picked once this week has settled. Until then the pick
// screen stays on this week, for everyone, and next week is out of sight.

import { describe, expect, it } from 'vitest'

import { computeStandings } from '@/engine'
import type { GameState } from '@/engine'
import { afterWeek, buildState, cutoffOf } from '@/engine/testing/builder'

import type { ViewContext } from '../context'
import { buildPickScreen, pickScreenWeek } from '../pick-screen'

function contextOf(state: GameState, now: Date): ViewContext {
    return {
        state,
        standings: computeStandings(state, now),
        now,
        nameOf: (entryId) => {
            return entryId
        },
        plMatchdayOf: (weekNumber) => {
            return weekNumber + 10
        },
        crestOf: () => {
            return null
        },
    }
}

/** Week 1 has locked and Week 2 has opened. */
const justLocked = new Date(cutoffOf(1).getTime() + 60 * 60 * 1000)

// Arsenal won, Chelsea lost. Everton v Fulham is not played, so Week 1 is not settled.
const unsettled = buildState({
    weeks: [
        { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '-']] },
        { fixtures: [['Arsenal', 'Everton'], ['Chelsea', 'Fulham']] },
    ],
    entries: ['ann', 'bob', 'cat'],
    picks: { ann: ['Arsenal'], bob: ['Chelsea'], cat: ['Everton'] },
})

const settled = buildState({
    weeks: [
        { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '2-0']] },
        { fixtures: [['Arsenal', 'Everton'], ['Chelsea', 'Fulham']] },
    ],
    entries: ['ann', 'bob', 'cat'],
    picks: { ann: ['Arsenal'], bob: ['Chelsea'], cat: ['Everton'] },
})

describe('pickScreenWeek', () => {
    it('stays on Week 1 while it is unsettled, although Week 2 is open', () => {
        expect(pickScreenWeek(contextOf(unsettled, justLocked), 2)).toBe(1)
    })

    it('stays on Week 1 even when the player’s own result is already in and they are through', () => {
        // ann’s Arsenal won. She still cannot see Week 2, because Everton v Fulham is not played.
        const context = contextOf(unsettled, afterWeek(1))

        expect(pickScreenWeek(context, 2)).toBe(1)
        expect(buildPickScreen(context, 'ann', 1).status).toBe('locked')
    })

    it('moves on to Week 2 once Week 1 has settled', () => {
        expect(pickScreenWeek(contextOf(settled, afterWeek(1)), 2)).toBe(2)
    })

    it('settles on an admin override of the held game', () => {
        const overridden = buildState({
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '-', 'V']] },
                { fixtures: [['Arsenal', 'Everton'], ['Chelsea', 'Fulham']] },
            ],
            entries: ['ann'],
            picks: { ann: ['Arsenal'] },
        })

        expect(pickScreenWeek(contextOf(overridden, afterWeek(1)), 2)).toBe(2)
    })

    it('is Week 1 when only Week 1 is open', () => {
        expect(pickScreenWeek(contextOf(unsettled, justLocked), 1)).toBe(1)
    })

    it('never goes past the latest open week', () => {
        const allSettled = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '2-0']] }],
            entries: ['ann', 'bob', 'cat', 'dan'],
            picks: { ann: ['Arsenal'], bob: ['Arsenal'], cat: ['Everton'], dan: ['Everton'] },
        })

        expect(pickScreenWeek(contextOf(allSettled, afterWeek(1)), 1)).toBe(1)
    })
})

describe('Week 2 before Week 1 has settled', () => {
    const context = contextOf(unsettled, afterWeek(1))

    it('cannot be picked by a player who is through', () => {
        expect(buildPickScreen(context, 'ann', 2).status).toBe('waitingForResult')
    })

    it('cannot be picked by a player whose result is still to come', () => {
        expect(buildPickScreen(context, 'cat', 2).status).toBe('waitingForResult')
    })

    it('is also waiting for a player whose own result is a loss, as “out” is not final until the week settles', () => {
        expect(buildPickScreen(context, 'bob', 2).status).toBe('waitingForResult')
    })

    it('can be picked by a player who is through, once Week 1 has settled', () => {
        expect(buildPickScreen(contextOf(settled, afterWeek(1)), 'ann', 2).status).toBe('open')
    })

    it('is final “out” for a player who lost, once Week 1 has settled', () => {
        expect(buildPickScreen(contextOf(settled, afterWeek(1)), 'bob', 2).status).toBe('out')
    })
})
