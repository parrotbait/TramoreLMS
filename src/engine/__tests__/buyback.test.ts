// Created by Claude driven by Eddie Long on 2026-10-31.

import { describe, expect, it } from 'vitest'

import {
    computeStandings,
    isBuybackAvailable,
    validatePick,
} from '../index'
import { afterWeek, buildState, cutoffOf } from '../testing/builder'

const weeks = [
    { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '1-0']] },
    { fixtures: [['Arsenal', 'Everton', '0-1'], ['Chelsea', 'Fulham', '2-0']] },
    { fixtures: [['Arsenal', 'Fulham', '-'], ['Chelsea', 'Everton', '-']] },
] as const

describe('Rule 3: buy-back after Week 1 only (Decision 4b)', () => {
    const state = buildState({
        weeks,
        entries: ['ann', 'bob', 'cat'],
        picks: { ann: ['Arsenal'], bob: ['Everton'], cat: ['Chelsea'] },
    })

    it('offers buy-back to a Week 1 loser before the Week 2 cut-off', () => {
        const now = afterWeek(1)
        expect(isBuybackAvailable(state, computeStandings(state, now), now, 'cat')).toBe(true)
    })

    it('closes buy-back at the Week 2 cut-off', () => {
        const now = cutoffOf(2)
        expect(isBuybackAvailable(state, computeStandings(state, now), now, 'cat')).toBe(false)
    })

    it('does not offer buy-back to a player who is still in', () => {
        const now = afterWeek(1)
        expect(isBuybackAvailable(state, computeStandings(state, now), now, 'ann')).toBe(false)
    })

    it('does not offer buy-back before Week 1 settles', () => {
        const unsettled = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '-']] }, weeks[1]],
            entries: ['ann', 'bob', 'cat'],
            picks: { ann: ['Arsenal'], bob: ['Everton'], cat: ['Chelsea'] },
        })
        const now = afterWeek(1)
        expect(isBuybackAvailable(unsettled, computeStandings(unsettled, now), now, 'cat')).toBe(false)
    })

    it('does not offer buy-back to a Week 2 loser', () => {
        const now = afterWeek(2)
        const later = buildState({
            weeks,
            entries: ['ann', 'bob', 'cat'],
            picks: { ann: ['Arsenal', 'Chelsea'], bob: ['Everton', 'Arsenal'], cat: ['Chelsea'] },
        })
        expect(isBuybackAvailable(later, computeStandings(later, now), now, 'bob')).toBe(false)
    })

    it('does not offer buy-back twice', () => {
        const boughtBack = buildState({
            weeks,
            entries: ['ann', 'bob', 'cat'],
            boughtBack: ['cat'],
            picks: { ann: ['Arsenal'], bob: ['Everton'], cat: ['Chelsea'] },
        })
        const now = afterWeek(1)
        expect(isBuybackAvailable(boughtBack, computeStandings(boughtBack, now), now, 'cat')).toBe(false)
    })

    it('does not offer buy-back when everyone went out together in Week 1', () => {
        const allOut = buildState({
            weeks,
            entries: ['ann', 'bob'],
            picks: { ann: ['Chelsea'], bob: ['Fulham'] },
        })
        const now = afterWeek(1)
        expect(isBuybackAvailable(allOut, computeStandings(allOut, now), now, 'ann')).toBe(false)
    })
})

describe('After a buy-back', () => {
    const state = buildState({
        weeks,
        entries: ['ann', 'bob', 'cat'],
        boughtBack: ['cat'],
        picks: { ann: ['Arsenal'], bob: ['Everton'], cat: ['Chelsea'] },
    })

    it('puts the player back in for Week 2', () => {
        const standings = computeStandings(state, afterWeek(1))
        expect(standings.entries.get('cat')?.status).toBe('in')
        expect(standings.entries.get('cat')?.eliminatedInWeek).toBeNull()
    })

    it('keeps the Week 1 team used', () => {
        expect(validatePick(state, afterWeek(1), 'cat', 2, 'Chelsea')).toEqual({ ok: false, reason: 'teamUsed' })
        expect(validatePick(state, afterWeek(1), 'cat', 2, 'Fulham')).toEqual({ ok: true })
    })
})

describe('A single Week 1 survivor waits for the buy-back window', () => {
    const state = buildState({
        weeks: [
            { fixtures: [['Arsenal', 'Chelsea', '1-0']] },
            { fixtures: [['Arsenal', 'Everton', '-']] },
        ],
        entries: ['ann', 'bob'],
        picks: { ann: ['Arsenal'], bob: ['Chelsea'] },
    })

    it('keeps the competition running while buy-back is open', () => {
        expect(computeStandings(state, afterWeek(1)).outcome).toEqual({ kind: 'running' })
    })

    it('declares the winner once the window closes with no buy-back', () => {
        expect(computeStandings(state, cutoffOf(2)).outcome).toEqual({ kind: 'won', week: 1, winners: ['ann'] })
    })

    it('carries on if the loser buys back', () => {
        const boughtBack = { ...state, entries: [state.entries[0]!, { id: 'bob', boughtBack: true }] }
        expect(computeStandings(boughtBack, cutoffOf(2)).outcome).toEqual({ kind: 'running' })
    })
})
