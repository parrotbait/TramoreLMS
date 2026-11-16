// Created by Claude driven by Eddie Long on 2026-11-16.

import { describe, expect, it } from 'vitest'

import { computeStandings } from '@/engine'
import type { GameState } from '@/engine'
import { afterWeek, beforeCutoff, buildState, cutoffOf } from '@/engine/testing/builder'

import type { ViewContext } from '../context'
import { latestRevealedWeek } from '../picks-reveal'

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

const threeWeeks = buildState({
    weeks: [
        { fixtures: [['Arsenal', 'Chelsea'], ['Everton', 'Fulham']] },
        { fixtures: [['Arsenal', 'Everton'], ['Chelsea', 'Fulham']] },
        { fixtures: [['Arsenal', 'Fulham'], ['Chelsea', 'Everton']] },
    ],
    entries: ['ann'],
    picks: { ann: ['Arsenal'] },
})

describe('latestRevealedWeek', () => {
    it('is Week 1 just after the Week 1 cut-off, although Week 2 is open', () => {
        const justAfter = new Date(cutoffOf(1).getTime() + 60 * 1000)

        expect(latestRevealedWeek(contextOf(threeWeeks, justAfter), 2)).toBe(1)
    })

    it('moves on to Week 2 once the Week 2 cut-off passes', () => {
        const justAfter = new Date(cutoffOf(2).getTime() + 60 * 1000)

        expect(latestRevealedWeek(contextOf(threeWeeks, justAfter), 3)).toBe(2)
    })

    it('falls back to the latest open week before any cut-off', () => {
        expect(latestRevealedWeek(contextOf(threeWeeks, beforeCutoff(1)), 1)).toBe(1)
    })

    it('is the latest open week when its own cut-off has passed', () => {
        expect(latestRevealedWeek(contextOf(threeWeeks, afterWeek(1)), 1)).toBe(1)
    })
})
