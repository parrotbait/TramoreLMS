// Created by Claude driven by Eddie Long on 2026-11-15.

import { describe, expect, it } from 'vitest'

import { computeStandings } from '@/engine'
import type { GameState } from '@/engine'
import { afterWeek, buildState, cutoffOf } from '@/engine/testing/builder'

import type { ViewContext } from '../context'
import { pickScreenWeeks } from '../pick-screen'

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

/** Week 1 has locked, and its games are still to be played. */
const justLocked = new Date(cutoffOf(1).getTime() + 60 * 60 * 1000)

const gamesToPlay = buildState({
    weeks: [
        { fixtures: [['Arsenal', 'Chelsea'], ['Everton', 'Fulham']] },
        { fixtures: [['Arsenal', 'Everton'], ['Chelsea', 'Fulham']] },
    ],
    entries: ['ann'],
    picks: { ann: ['Arsenal'] },
})

describe('pickScreenWeeks', () => {
    it('offers a tab back to last week while its games are still to play', () => {
        const result = pickScreenWeeks(contextOf(gamesToPlay, justLocked), 'ann', 2, null)

        expect(result.tabs).toEqual([
            { weekNumber: 1, label: 'Week 1 · pending' },
            { weekNumber: 2, label: 'Week 2' },
        ])
    })

    it('shows the latest week unless last week is asked for', () => {
        const context = contextOf(gamesToPlay, justLocked)

        expect(pickScreenWeeks(context, 'ann', 2, null).weekNumber).toBe(2)
        expect(pickScreenWeeks(context, 'ann', 2, 1).weekNumber).toBe(1)
    })

    it('ignores any other week in the address', () => {
        const context = contextOf(gamesToPlay, justLocked)

        expect(pickScreenWeeks(context, 'ann', 2, 7).weekNumber).toBe(2)
        expect(pickScreenWeeks(context, 'ann', 2, 0).weekNumber).toBe(2)
    })

    it('has no tabs in Week 1, as there is no week before it', () => {
        const result = pickScreenWeeks(contextOf(gamesToPlay, new Date(cutoffOf(1).getTime() - 3_600_000)), 'ann', 1, 1)

        expect(result).toEqual({ weekNumber: 1, tabs: [] })
    })

    it('has no tabs once last week’s games are all played', () => {
        const played = buildState({
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '1-0']] },
                { fixtures: [['Arsenal', 'Everton'], ['Chelsea', 'Fulham']] },
            ],
            entries: ['ann'],
            picks: { ann: ['Arsenal'] },
        })

        expect(pickScreenWeeks(contextOf(played, afterWeek(1)), 'ann', 2, 1)).toEqual({ weekNumber: 2, tabs: [] })
    })

    it('does not wait for a postponed game', () => {
        const postponed = buildState({
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', 'P']] },
                { fixtures: [['Arsenal', 'Everton'], ['Chelsea', 'Fulham']] },
            ],
            entries: ['ann'],
            picks: { ann: ['Arsenal'] },
        })

        expect(pickScreenWeeks(contextOf(postponed, afterWeek(1)), 'ann', 2, null).tabs).toEqual([])
    })

    it('has no tabs for a player who was not in last week', () => {
        const result = pickScreenWeeks(contextOf(gamesToPlay, justLocked), 'nobody', 2, 1)

        expect(result).toEqual({ weekNumber: 2, tabs: [] })
    })

    describe('a player whose pick has lost while the week is still running', () => {
        const lostWhileRunning = buildState({
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '0-1'], ['Everton', 'Fulham']] },
                { fixtures: [['Arsenal', 'Everton'], ['Chelsea', 'Fulham']] },
            ],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal'], bob: ['Chelsea'] },
        })

        it('shows only last week, with no Week 2 tab', () => {
            const result = pickScreenWeeks(contextOf(lostWhileRunning, justLocked), 'ann', 2, null)

            expect(result).toEqual({ weekNumber: 1, tabs: [] })
        })

        it('ignores a request for Week 2 in the address', () => {
            const result = pickScreenWeeks(contextOf(lostWhileRunning, justLocked), 'ann', 2, 2)

            expect(result).toEqual({ weekNumber: 1, tabs: [] })
        })

        it('still lets a player whose pick won go on to Week 2', () => {
            const result = pickScreenWeeks(contextOf(lostWhileRunning, justLocked), 'bob', 2, null)

            expect(result.weekNumber).toBe(2)
            expect(result.tabs.length).toBe(2)
        })

        it('shows Week 2 once every game in Week 1 is played', () => {
            const settled = buildState({
                weeks: [
                    { fixtures: [['Arsenal', 'Chelsea', '0-1'], ['Everton', 'Fulham', '1-0']] },
                    { fixtures: [['Arsenal', 'Everton'], ['Chelsea', 'Fulham']] },
                ],
                entries: ['ann', 'bob'],
                picks: { ann: ['Arsenal'], bob: ['Chelsea'] },
            })

            expect(pickScreenWeeks(contextOf(settled, afterWeek(1)), 'ann', 2, null).weekNumber).toBe(2)
        })
    })
})
