// Created by Claude driven by Eddie Long on 2026-10-31.

import { describe, expect, it } from 'vitest'

import type { GameState } from '@/engine'
import { afterWeek, beforeCutoff, buildState, cutoffOf, weekStart, withPicks } from '@/engine/testing/builder'

import { planTick } from '../plan-tick'
import type { CompetitionStatus, TickWeek } from '../plan-tick'

function weeksOf(state: GameState, settled: readonly number[] = []): TickWeek[] {
    return state.weeks.map((week) => {
        return {
            number: week.number,
            openedAt: week.cutoffAt === null ? null : new Date(week.cutoffAt.getTime() - 6 * 24 * 60 * 60 * 1000),
            settledAt: settled.includes(week.number) ? afterWeek(week.number) : null,
        }
    })
}

function tick(state: GameState, now: Date, status: CompetitionStatus = 'running', settled: readonly number[] = []) {
    return planTick({ state, weeks: weeksOf(state, settled), status, now })
}

const unopened = buildState({
    weeks: [
        { fixtures: [['Arsenal', 'Chelsea'], ['Everton', 'Fulham']], open: false },
        { fixtures: [['Arsenal', 'Everton'], ['Chelsea', 'Fulham']], open: false },
    ],
    entries: ['ann', 'bob'],
})

describe('planTick: opening weeks (Decision 12)', () => {
    it('does nothing for a draft or finished competition', () => {
        expect(tick(unopened, beforeCutoff(1), 'draft')).toEqual({
            openings: [],
            picks: [],
            settledWeeks: [],
            status: 'draft',
            alerts: [],
        })
        expect(tick(unopened, beforeCutoff(1), 'finished').openings).toEqual([])
    })

    it('opens Week 1 as soon as the competition is open, fixing the cut-off', () => {
        expect(tick(unopened, beforeCutoff(1), 'open').openings).toEqual([{ weekNumber: 1, cutoffAt: cutoffOf(1) }])
    })

    it('opens the next week only once the previous week’s cut-off has passed', () => {
        const weekOneOpen: GameState = {
            ...unopened,
            weeks: [{ number: 1, cutoffAt: cutoffOf(1) }, { number: 2, cutoffAt: null }],
        }

        expect(tick(weekOneOpen, beforeCutoff(1)).openings).toEqual([])
        expect(tick(weekOneOpen, cutoffOf(1)).openings).toEqual([{ weekNumber: 2, cutoffAt: cutoffOf(2) }])
    })

    it('ignores fixtures already postponed when fixing the cut-off', () => {
        const postponedFirst = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', 'P'], ['Everton', 'Fulham']], open: false }],
            entries: ['ann'],
        })
        const opened = tick(postponedFirst, beforeCutoff(1), 'open').openings[0]
        const secondKickoff = new Date(weekStart(1).getTime() + 2 * 60 * 60 * 1000)

        expect(opened?.cutoffAt).toEqual(new Date(secondKickoff.getTime() - 60 * 60 * 1000))
    })

    it('alerts instead of opening a week with no fixtures', () => {
        const empty: GameState = { ...unopened, fixtures: [] }
        expect(tick(empty, beforeCutoff(1), 'open')).toMatchObject({
            openings: [],
            alerts: [{ kind: 'weekWithoutFixtures', weekNumber: 1 }],
        })
    })
})

describe('planTick: locking (rule 4)', () => {
    const open = buildState({
        weeks: [{ fixtures: [['Chelsea', 'Arsenal'], ['Everton', 'Fulham']] }],
        entries: ['ann', 'bob'],
        picks: { bob: ['Everton'] },
    })

    it('does not auto-assign before the cut-off', () => {
        expect(tick(open, beforeCutoff(1), 'open').picks).toEqual([])
    })

    it('auto-assigns everyone without a pick once the cut-off passes', () => {
        expect(tick(open, cutoffOf(1), 'open').picks).toEqual([
            { entryId: 'ann', week: 1, teamId: 'Arsenal', source: 'auto' },
        ])
    })

    it('assigns nothing new on a second tick', () => {
        const first = tick(open, cutoffOf(1), 'open')
        const second = tick(withPicks(open, first.picks), cutoffOf(1), 'running')
        expect(second.picks).toEqual([])
    })
})

describe('planTick: settling and status', () => {
    const played = buildState({
        weeks: [
            { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '1-0']] },
            { fixtures: [['Arsenal', 'Everton'], ['Chelsea', 'Fulham']] },
        ],
        entries: ['ann', 'bob', 'cat'],
        picks: { ann: ['Arsenal'], bob: ['Everton'], cat: ['Chelsea'] },
    })

    it('marks a week settled once every outcome is final', () => {
        expect(tick(played, afterWeek(1)).settledWeeks).toEqual([1])
    })

    it('does not mark a week settled twice', () => {
        expect(tick(played, afterWeek(1), 'running', [1]).settledWeeks).toEqual([])
    })

    it('moves an open competition to running at the Week 1 cut-off', () => {
        expect(tick(played, beforeCutoff(1), 'open').status).toBe('open')
        expect(tick(played, cutoffOf(1), 'open').status).toBe('running')
    })

    it('finishes the competition when it has been won', () => {
        const won = buildState({
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '1-0']] },
                { fixtures: [['Arsenal', 'Everton', '0-1'], ['Chelsea', 'Fulham', '0-0']] },
            ],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal', 'Everton'], bob: ['Everton', 'Chelsea'] },
        })
        expect(tick(won, afterWeek(2)).status).toBe('finished')
    })
})

describe('planTick: auto-pass alerts', () => {
    it('alerts the admin when a player gets an auto-pass', () => {
        const state = buildState({
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '1-0']] },
                { fixtures: [['Chelsea', 'Everton', '0-1'], ['Arsenal', 'Fulham', '0-0']] },
                { fixtures: [['Arsenal', 'Everton']] },
            ],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal', 'Everton'], bob: ['Everton', 'Arsenal'] },
            pickOverrides: [['bob', 2, 'through']],
        })

        expect(tick(state, cutoffOf(3)).alerts).toEqual([
            { kind: 'autoPass', entryId: 'ann', weekNumber: 3 },
            { kind: 'autoPass', entryId: 'bob', weekNumber: 3 },
        ])
    })
})
