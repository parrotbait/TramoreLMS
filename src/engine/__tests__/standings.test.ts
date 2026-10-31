// Created by Claude driven by Eddie Long on 2026-10-31.

import { describe, expect, it } from 'vitest'

import { computeStandings } from '../index'
import type { Standings } from '../index'
import { afterWeek, beforeCutoff, buildState, cutoffOf } from '../testing/builder'

function statusOf(standings: Standings, entryId: string) {
    return standings.entries.get(entryId)?.status
}

function weekOf(standings: Standings, entryId: string, week: number) {
    return standings.entries.get(entryId)?.weeks.find((entryWeek) => {
        return entryWeek.week === week
    })
}

describe('Rule 1: win is through, draw or loss is out (Decision 5)', () => {
    const state = buildState({
        weeks: [{
            fixtures: [
                ['Arsenal', 'Chelsea', '2-0'],
                ['Everton', 'Fulham', '1-1'],
                ['Leeds', 'Wolves', '0-3'],
            ],
        }],
        entries: ['ann', 'bob', 'cat', 'dan'],
        picks: { ann: ['Arsenal'], bob: ['Everton'], cat: ['Leeds'], dan: ['Wolves'] },
    })
    const standings = computeStandings(state, afterWeek(1))

    it('puts a home winner through', () => {
        expect(statusOf(standings, 'ann')).toBe('in')
        expect(weekOf(standings, 'ann', 1)?.reason).toBe('win')
    })

    it('puts an away winner through', () => {
        expect(statusOf(standings, 'dan')).toBe('in')
    })

    it('puts a draw out', () => {
        expect(statusOf(standings, 'bob')).toBe('out')
        expect(weekOf(standings, 'bob', 1)?.reason).toBe('draw')
        expect(standings.entries.get('bob')?.eliminatedInWeek).toBe(1)
    })

    it('puts a loss out', () => {
        expect(statusOf(standings, 'cat')).toBe('out')
        expect(weekOf(standings, 'cat', 1)?.reason).toBe('loss')
    })

    it('settles the week and keeps running with two survivors', () => {
        expect(standings.lastSettledWeek).toBe(1)
        expect(standings.outcome).toEqual({ kind: 'running' })
    })
})

describe('Unsettled weeks (Decision 20)', () => {
    const state = buildState({
        weeks: [{
            fixtures: [
                ['Arsenal', 'Chelsea', '2-0'],
                ['Everton', 'Fulham', '-'],
            ],
        }],
        entries: ['ann', 'bob', 'cat'],
        picks: { ann: ['Arsenal'], bob: ['Everton'], cat: ['Chelsea'] },
    })
    const standings = computeStandings(state, afterWeek(1))

    it('makes "through" final as soon as the result is in', () => {
        expect(weekOf(standings, 'ann', 1)?.outcome).toBe('through')
    })

    it('makes "out" provisional until the week settles', () => {
        expect(statusOf(standings, 'cat')).toBe('provisionallyOut')
        expect(standings.entries.get('cat')?.eliminatedInWeek).toBeNull()
    })

    it('waits for results that are not in', () => {
        expect(weekOf(standings, 'bob', 1)?.reason).toBe('awaitingResult')
        expect(standings.lastSettledWeek).toBe(0)
    })
})

describe('Before and at the cut-off (Decision 12)', () => {
    const spec = {
        weeks: [{ fixtures: [['Arsenal', 'Chelsea', '-']] as const }],
        entries: ['ann', 'bob'],
        picks: { ann: ['Arsenal'] },
    }

    it('shows every entry as waiting for the cut-off before it passes', () => {
        const standings = computeStandings(buildState(spec), beforeCutoff(1))
        expect(weekOf(standings, 'ann', 1)?.reason).toBe('awaitingCutoff')
        expect(weekOf(standings, 'bob', 1)?.reason).toBe('awaitingCutoff')
    })

    it('shows an entry with no pick as waiting for auto-assign after the cut-off', () => {
        const standings = computeStandings(buildState(spec), cutoffOf(1))
        expect(weekOf(standings, 'bob', 1)?.reason).toBe('awaitingPick')
        expect(standings.lastSettledWeek).toBe(0)
    })

    it('never settles a week that has not opened', () => {
        const state = buildState({
            ...spec,
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '1-0']], open: false }],
        })
        const standings = computeStandings(state, afterWeek(1))
        expect(weekOf(standings, 'ann', 1)?.reason).toBe('awaitingCutoff')
    })
})

describe('Rule 5: postponed, cancelled and abandoned matches (Decision 7)', () => {
    it('puts a player through when their match is postponed after the cut-off', () => {
        const state = buildState({
            weeks: [{
                fixtures: [
                    ['Arsenal', 'Chelsea', 'PL'],
                    ['Everton', 'Fulham', '1-0'],
                ],
            }],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal'], bob: ['Fulham'] },
        })
        const standings = computeStandings(state, afterWeek(1))

        expect(weekOf(standings, 'ann', 1)?.reason).toBe('void')
        expect(statusOf(standings, 'ann')).toBe('in')
    })

    it('does not accept a pick on a match postponed before the cut-off', () => {
        const state = buildState({
            weeks: [{
                fixtures: [
                    ['Arsenal', 'Chelsea', 'P'],
                    ['Everton', 'Fulham', '1-0'],
                ],
            }],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal'], bob: ['Everton'] },
        })
        const standings = computeStandings(state, afterWeek(1))

        expect(weekOf(standings, 'ann', 1)?.reason).toBe('awaitingPick')
    })

    it('counts the confirmed result of an abandoned match', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', 'A', '0-1']] }],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal'], bob: ['Chelsea'] },
        })
        const standings = computeStandings(state, afterWeek(1))

        expect(weekOf(standings, 'ann', 1)?.reason).toBe('loss')
        expect(statusOf(standings, 'bob')).toBe('in')
    })

    it('keeps an abandoned match pending while the rest of the week is unplayed', () => {
        const state = buildState({
            weeks: [{
                fixtures: [
                    ['Arsenal', 'Chelsea', 'A'],
                    ['Everton', 'Fulham', '-'],
                ],
            }],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal'], bob: ['Fulham'] },
        })
        const standings = computeStandings(state, afterWeek(1))

        expect(weekOf(standings, 'ann', 1)?.reason).toBe('awaitingResult')
    })

    it('voids an abandoned match with no result once the rest of the week is done', () => {
        const state = buildState({
            weeks: [{
                fixtures: [
                    ['Arsenal', 'Chelsea', 'A'],
                    ['Everton', 'Fulham', '2-2'],
                    ['Leeds', 'Wolves', 'A'],
                ],
            }],
            entries: ['ann', 'bob', 'cat'],
            picks: { ann: ['Arsenal'], bob: ['Fulham'], cat: ['Wolves'] },
        })
        const standings = computeStandings(state, afterWeek(1))

        expect(weekOf(standings, 'ann', 1)?.reason).toBe('void')
        expect(weekOf(standings, 'cat', 1)?.reason).toBe('void')
        expect(statusOf(standings, 'bob')).toBe('out')
    })
})

describe('Rule 6: how it ends (Decision 6)', () => {
    it('declares a single survivor the winner straight away', () => {
        const state = buildState({
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '1-0']] },
                { fixtures: [['Arsenal', 'Chelsea', '0-2'], ['Everton', 'Fulham', '0-1']] },
                { fixtures: [['Arsenal', 'Chelsea', '-']] },
            ],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal', 'Chelsea'], bob: ['Everton', 'Arsenal'] },
        })
        const standings = computeStandings(state, afterWeek(2))

        expect(standings.outcome).toEqual({ kind: 'won', week: 2, winners: ['ann'] })
        expect(statusOf(standings, 'ann')).toBe('winner')
    })

    it('keeps everyone in when everyone still in goes out in the same week', () => {
        const state = buildState({
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '0-0'], ['Everton', 'Fulham', '0-1']] },
                { fixtures: [['Arsenal', 'Chelsea', '-']] },
            ],
            entries: ['ann', 'bob', 'cat'],
            picks: { ann: ['Arsenal'], bob: ['Chelsea'], cat: ['Everton'] },
        })
        const standings = computeStandings(state, afterWeek(1))

        for (const entryId of ['ann', 'bob', 'cat']) {
            expect(statusOf(standings, entryId)).toBe('in')
            expect(weekOf(standings, entryId, 1)?.reinstated).toBe(true)
        }
        expect(standings.lastSettledWeek).toBe(1)
        expect(standings.outcome).toEqual({ kind: 'running' })
    })

    it('only reinstates players who were still in that week', () => {
        const state = buildState({
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '1-0']] },
                { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '0-0']] },
                { fixtures: [['Arsenal', 'Chelsea', '-']] },
            ],
            entries: ['ann', 'bob', 'cat'],
            picks: { ann: ['Arsenal', 'Chelsea'], bob: ['Everton', 'Fulham'], cat: ['Chelsea'] },
        })
        const standings = computeStandings(state, afterWeek(2))

        expect(statusOf(standings, 'cat')).toBe('out')
        expect(statusOf(standings, 'ann')).toBe('in')
        expect(statusOf(standings, 'bob')).toBe('in')
    })

    it('shares the prize between the survivors after the final week', () => {
        const state = buildState({
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '1-0']] },
                { fixtures: [['Arsenal', 'Chelsea', '0-1'], ['Everton', 'Fulham', '0-1']] },
            ],
            finalWeek: 2,
            entries: ['ann', 'bob', 'cat'],
            picks: { ann: ['Arsenal', 'Chelsea'], bob: ['Everton', 'Fulham'], cat: ['Chelsea'] },
        })
        const standings = computeStandings(state, afterWeek(2))

        expect(standings.outcome).toEqual({ kind: 'won', week: 2, winners: ['ann', 'bob'] })
    })

    it('shares the prize when everyone goes out together in the final week', () => {
        const state = buildState({
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '1-0']] },
                { fixtures: [['Arsenal', 'Chelsea', '1-1'], ['Everton', 'Fulham', '1-1']] },
            ],
            finalWeek: 2,
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal', 'Chelsea'], bob: ['Everton', 'Fulham'] },
        })
        const standings = computeStandings(state, afterWeek(2))

        expect(standings.outcome).toEqual({ kind: 'won', week: 2, winners: ['ann', 'bob'] })
    })

    it('ignores weeks after the final week', () => {
        const state = buildState({
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '1-0']] },
                { fixtures: [['Arsenal', 'Chelsea', '0-1']] },
            ],
            finalWeek: 1,
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal', 'Arsenal'], bob: ['Everton', 'Chelsea'] },
        })
        const standings = computeStandings(state, afterWeek(2))

        expect(standings.outcome).toEqual({ kind: 'won', week: 1, winners: ['ann', 'bob'] })
    })
})

describe('Admin overrides (Decision 9)', () => {
    it('applies a fixture override to everyone who picked that fixture', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '0-1', '2-1'], ['Everton', 'Fulham', '1-0']] }],
            entries: ['ann', 'bob', 'cat'],
            picks: { ann: ['Arsenal'], bob: ['Arsenal'], cat: ['Everton'] },
        })
        const standings = computeStandings(state, afterWeek(1))

        expect(statusOf(standings, 'ann')).toBe('in')
        expect(statusOf(standings, 'bob')).toBe('in')
    })

    it('voids a fixture so everyone who picked it goes through', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '0-1', 'V'], ['Everton', 'Fulham', '1-0']] }],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal'], bob: ['Everton'] },
        })
        const standings = computeStandings(state, afterWeek(1))

        expect(weekOf(standings, 'ann', 1)?.reason).toBe('void')
    })

    it('puts one player through with a pick override and leaves others alone', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '0-1'], ['Everton', 'Fulham', '1-0']] }],
            entries: ['ann', 'bob', 'cat'],
            picks: { ann: ['Arsenal'], bob: ['Arsenal'], cat: ['Everton'] },
            pickOverrides: [['ann', 1, 'through']],
        })
        const standings = computeStandings(state, afterWeek(1))

        expect(statusOf(standings, 'ann')).toBe('in')
        expect(weekOf(standings, 'ann', 1)?.reason).toBe('pickOverride')
        expect(statusOf(standings, 'bob')).toBe('out')
    })

    it('puts one player out with a pick override', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '1-0']] }],
            entries: ['ann', 'bob', 'cat'],
            picks: { ann: ['Arsenal'], bob: ['Arsenal'], cat: ['Everton'] },
            pickOverrides: [['ann', 1, 'out']],
        })
        const standings = computeStandings(state, afterWeek(1))

        expect(statusOf(standings, 'ann')).toBe('out')
        expect(statusOf(standings, 'bob')).toBe('in')
    })

    it('settles a week from a pick override even when the entry has no pick', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '1-0']] }],
            entries: ['ann', 'bob', 'cat'],
            picks: { ann: ['Arsenal'], bob: ['Arsenal'] },
            pickOverrides: [['cat', 1, 'through']],
        })
        const standings = computeStandings(state, afterWeek(1))

        expect(standings.lastSettledWeek).toBe(1)
        expect(statusOf(standings, 'cat')).toBe('in')
    })
})

describe('Passes and withdrawals', () => {
    it('puts an auto-pass through (Decision 8)', () => {
        const base = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '0-1']] }],
            entries: ['ann', 'bob'],
            picks: { bob: ['Chelsea'] },
        })
        const state = {
            ...base,
            picks: [...base.picks, { entryId: 'ann', week: 1, teamId: null, source: 'autoPass' as const }],
        }
        const standings = computeStandings(state, afterWeek(1))

        expect(weekOf(standings, 'ann', 1)?.reason).toBe('pass')
        expect(statusOf(standings, 'ann')).toBe('in')
    })

    it('removes a withdrawn entry from the week it withdrew', () => {
        const state = buildState({
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '1-0']] },
                { fixtures: [['Arsenal', 'Chelsea', '-'], ['Everton', 'Fulham', '-']] },
            ],
            entries: ['ann', 'bob', 'cat'],
            withdrawn: { cat: 2 },
            picks: { ann: ['Arsenal'], bob: ['Everton'], cat: ['Arsenal'] },
        })
        const standings = computeStandings(state, beforeCutoff(2))

        expect(statusOf(standings, 'cat')).toBe('withdrawn')
        expect(weekOf(standings, 'cat', 2)).toBeUndefined()
    })

    it('reports no players when everyone has withdrawn', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '-']] }],
            entries: ['ann'],
            withdrawn: { ann: 1 },
        })

        expect(computeStandings(state, afterWeek(1)).outcome).toEqual({ kind: 'noPlayers' })
    })
})
