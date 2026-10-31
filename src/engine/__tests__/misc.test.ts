// Created by Claude driven by Eddie Long on 2026-10-31.

import { describe, expect, it } from 'vitest'

import {
    areEntriesOpen,
    computeCutoff,
    reconcile,
    resolveWeekFixtures,
    splitPrize,
} from '../index'
import type { Fixture } from '../index'
import { afterWeek, beforeCutoff, buildState, cutoffOf, weekStart } from '../testing/builder'

describe('computeCutoff (Decision 12)', () => {
    const state = buildState({
        weeks: [{ fixtures: [['Arsenal', 'Chelsea', 'P'], ['Everton', 'Fulham', '-'], ['Leeds', 'Wolves', '-']] }],
        entries: [],
    })

    it('is 1 hour before the earliest kick-off that is not postponed', () => {
        // Arsenal v Chelsea (fixture 0) is postponed, so Everton v Fulham (fixture 1, +2h) is earliest.
        const expected = new Date(weekStart(1).getTime() + 2 * 60 * 60 * 1000 - 60 * 60 * 1000)
        expect(computeCutoff(state.fixtures, beforeCutoff(1))).toEqual(expected)
    })

    it('is null for a week with no fixtures', () => {
        expect(computeCutoff([], beforeCutoff(1))).toBeNull()
    })
})

describe('resolveWeekFixtures', () => {
    function resolve(result: string, override?: string) {
        const fixture = override === undefined
            ? ['Arsenal', 'Chelsea', result] as const
            : ['Arsenal', 'Chelsea', result, override] as const
        const state = buildState({ weeks: [{ fixtures: [fixture] }], entries: [] })
        const week = state.weeks[0]!
        return resolveWeekFixtures(week, state.fixtures).get((state.fixtures[0] as Fixture).id)
    }

    it('resolves a finished match to its score', () => {
        expect(resolve('3-1')).toEqual({ kind: 'result', home: 3, away: 1 })
    })

    it('keeps an unplayed match pending', () => {
        expect(resolve('-')).toEqual({ kind: 'pending' })
    })

    it('removes a match postponed before the cut-off', () => {
        expect(resolve('P')).toEqual({ kind: 'removed' })
    })

    it('voids a match postponed after the cut-off', () => {
        expect(resolve('PL')).toEqual({ kind: 'void' })
    })

    it('lets an override replace the feed result', () => {
        expect(resolve('0-1', '1-0')).toEqual({ kind: 'result', home: 1, away: 0 })
    })

    it('lets an override void a match', () => {
        expect(resolve('0-1', 'V')).toEqual({ kind: 'void' })
    })

    it('voids an abandoned match when it is the only match', () => {
        expect(resolve('A')).toEqual({ kind: 'void' })
    })

    it('removes every postponed match in a week that has not opened', () => {
        const state = buildState({ weeks: [{ fixtures: [['Arsenal', 'Chelsea', 'PL']], open: false }], entries: [] })
        const resolutions = resolveWeekFixtures(state.weeks[0]!, state.fixtures)
        expect([...resolutions.values()]).toEqual([{ kind: 'removed' }])
    })
})

describe('splitPrize (rule 6)', () => {
    it('gives one winner the whole prize', () => {
        expect(splitPrize(30_000, 1)).toEqual({ perWinnerCents: 30_000, remainderCents: 0 })
    })

    it('splits equally and leaves the odd cents with the club', () => {
        expect(splitPrize(30_000, 7)).toEqual({ perWinnerCents: 4285, remainderCents: 5 })
    })

    it('keeps the whole prize when there are no winners', () => {
        expect(splitPrize(30_000, 0)).toEqual({ perWinnerCents: 0, remainderCents: 30_000 })
    })
})

describe('reconcile (Decision 20)', () => {
    const kickoff = new Date('2026-11-07T15:00:00Z')
    const soon = new Date('2026-11-07T17:00:00Z')
    const late = new Date('2026-11-07T21:01:00Z')
    const finished = { finished: true, score: { home: 2, away: 1 } }

    it('accepts when both feeds agree', () => {
        expect(reconcile(finished, finished, kickoff, soon)).toEqual({ kind: 'accept', score: { home: 2, away: 1 } })
    })

    it('holds when the scores disagree', () => {
        const other = { finished: true, score: { home: 2, away: 2 } }
        expect(reconcile(finished, other, kickoff, soon)).toEqual({ kind: 'hold', reason: 'scoresDisagree' })
    })

    it('waits for the primary feed', () => {
        expect(reconcile({ finished: false, score: null }, finished, kickoff, soon)).toEqual({ kind: 'wait' })
    })

    it('waits for the cross-check for up to 6 hours after kick-off', () => {
        expect(reconcile(finished, undefined, kickoff, soon)).toEqual({ kind: 'wait' })
    })

    it('holds when the cross-check is still missing after 6 hours', () => {
        expect(reconcile(finished, { finished: false, score: null }, kickoff, late)).toEqual({
            kind: 'hold',
            reason: 'secondaryMissing',
        })
    })
})

describe('areEntriesOpen (Decision 4)', () => {
    const week = { number: 1, cutoffAt: cutoffOf(1) }

    it('is open before the Week 1 cut-off', () => {
        expect(areEntriesOpen(true, week, beforeCutoff(1))).toBe(true)
    })

    it('closes at the Week 1 cut-off', () => {
        expect(areEntriesOpen(true, week, cutoffOf(1))).toBe(false)
    })

    it('stays closed when the admin has closed entries', () => {
        expect(areEntriesOpen(false, week, beforeCutoff(1))).toBe(false)
    })

    it('is open before Week 1 has a cut-off', () => {
        expect(areEntriesOpen(true, { number: 1, cutoffAt: null }, afterWeek(1))).toBe(true)
    })
})
