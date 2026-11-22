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

/** Only the alerts of one kind, so a test is about one thing. */
function alertsOf(plan: ReturnType<typeof planTick>, kind: string) {
    return plan.alerts.filter((alert) => {
        return alert.kind === kind
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

describe('planTick: a week that is blocked by the week before it', () => {
    // Week 1 has a game with no result, so Week 1 is not settled and nobody can pick for Week 2.
    const held = buildState({
        weeks: [
            { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '-']] },
            { fixtures: [['Arsenal', 'Everton'], ['Chelsea', 'Fulham']] },
        ],
        entries: ['ann', 'bob'],
        picks: { ann: ['Arsenal'], bob: ['Everton'] },
    })
    const hours = (count: number) => {
        return new Date(cutoffOf(2).getTime() - count * 60 * 60 * 1000)
    }

    it('warns the admin once the blocked week’s cut-off is within 24 hours', () => {
        expect(alertsOf(tick(held, hours(23)), 'weekBlocked')).toEqual([
            { kind: 'weekBlocked', weekNumber: 2, cutoffAt: cutoffOf(2) },
        ])
    })

    it('keeps warning after the cut-off has passed, as players are then picked for', () => {
        expect(alertsOf(tick(held, new Date(cutoffOf(2).getTime() + 60_000)), 'weekBlocked')).toEqual([
            { kind: 'weekBlocked', weekNumber: 2, cutoffAt: cutoffOf(2) },
        ])
    })

    it('does not warn early, while there is plenty of time', () => {
        expect(alertsOf(tick(held, hours(30)), 'weekBlocked')).toEqual([])
    })

    it('stops warning once the week before has settled', () => {
        const settled = buildState({
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '2-0']] },
                { fixtures: [['Arsenal', 'Everton'], ['Chelsea', 'Fulham']] },
            ],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal'], bob: ['Everton'] },
        })

        expect(alertsOf(tick(settled, hours(5)), 'weekBlocked')).toEqual([])
    })

    it('warns about the first blocked week only, not the ones after it', () => {
        const three = buildState({
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '-']] },
                { fixtures: [['Arsenal', 'Everton'], ['Chelsea', 'Fulham']] },
                { fixtures: [['Arsenal', 'Fulham'], ['Chelsea', 'Everton']] },
            ],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal'], bob: ['Everton'] },
        })
        const weekThreeAlmostDue = new Date(cutoffOf(3).getTime() - 60 * 60 * 1000)

        expect(alertsOf(tick(three, weekThreeAlmostDue), 'weekBlocked')).toEqual([
            { kind: 'weekBlocked', weekNumber: 2, cutoffAt: cutoffOf(2) },
        ])
    })
})

describe('planTick: a week whose cut-off would already be past', () => {
    // Week 1 is open. Week 2 is not. Its first game starts 30 minutes after the Week 1 cut-off.
    const lateTick = (kickoffAfterCutoffMs: number) => {
        const base = buildState({
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea']] },
                { fixtures: [['Arsenal', 'Everton']], open: false },
            ],
            entries: ['ann'],
        })

        return {
            ...base,
            fixtures: base.fixtures.map((fixture) => {
                return fixture.week === 2
                    ? { ...fixture, kickoffAt: new Date(cutoffOf(1).getTime() + kickoffAfterCutoffMs) }
                    : fixture
            }),
        }
    }

    it('does not open it, and tells the admin, rather than locking it the moment it opens', () => {
        // The cut-off would be 1 hour before a game that starts 30 minutes after the tick: 30 minutes ago.
        const state = lateTick(30 * 60 * 1000)
        const result = tick(state, cutoffOf(1))

        expect(result.openings).toEqual([])
        expect(alertsOf(result, 'cutoffInThePast')).toEqual([
            { kind: 'cutoffInThePast', weekNumber: 2, cutoffAt: new Date(cutoffOf(1).getTime() - 30 * 60 * 1000) },
        ])
    })

    it('opens it as normal when its cut-off is still ahead', () => {
        const state = lateTick(3 * 60 * 60 * 1000)
        const result = tick(state, cutoffOf(1))

        expect(result.openings).toEqual([
            { weekNumber: 2, cutoffAt: new Date(cutoffOf(1).getTime() + 2 * 60 * 60 * 1000) },
        ])
        expect(alertsOf(result, 'cutoffInThePast')).toEqual([])
    })

    it('ignores a game brought forward to before the tick, instead of pulling the cut-off into the past', () => {
        const base = lateTick(3 * 60 * 60 * 1000)
        const withEarlyGame: GameState = {
            ...base,
            fixtures: [
                ...base.fixtures,
                { ...base.fixtures[1]!, id: 'early', kickoffAt: new Date(cutoffOf(1).getTime() - 24 * 60 * 60 * 1000) },
            ],
        }

        expect(tick(withEarlyGame, cutoffOf(1)).openings).toEqual([
            { weekNumber: 2, cutoffAt: new Date(cutoffOf(1).getTime() + 2 * 60 * 60 * 1000) },
        ])
    })
})

describe('planTick: results that are overdue', () => {
    const week = buildState({
        weeks: [{ fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '-'], ['Brentford', 'Leeds', '-']] }],
        entries: ['ann'],
        picks: { ann: ['Arsenal'] },
    })
    const kickoff = week.fixtures[1]!.kickoffAt
    const afterHours = (hours: number) => {
        return new Date(kickoff.getTime() + hours * 60 * 60 * 1000)
    }

    it('tells the admin when games have no result 4 hours after kick-off, whatever the reason', () => {
        // The games kick off two hours apart, so 6 hours after the first, both are over 4 hours old.
        expect(alertsOf(tick(week, afterHours(6)), 'resultsOverdue')).toEqual([
            { kind: 'resultsOverdue', weekNumber: 1, count: 2 },
        ])
        expect(alertsOf(tick(week, afterHours(4)), 'resultsOverdue')).toEqual([
            { kind: 'resultsOverdue', weekNumber: 1, count: 1 },
        ])
    })

    it('waits while a game could still be on', () => {
        expect(alertsOf(tick(week, afterHours(3)), 'resultsOverdue')).toEqual([])
    })

    it('does not count a game an admin has settled, or one that is postponed', () => {
        const settled = buildState({
            weeks: [{
                fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '-', '1-0'], ['Brentford', 'Leeds', 'P']],
            }],
            entries: ['ann'],
            picks: { ann: ['Arsenal'] },
        })

        expect(alertsOf(tick(settled, afterHours(8)), 'resultsOverdue')).toEqual([])
    })

    it('does not warn about a week that has not opened', () => {
        const notOpen = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '-']], open: false }],
            entries: ['ann'],
        })

        expect(alertsOf(tick(notOpen, afterHours(48), 'open'), 'resultsOverdue')).toEqual([])
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
    it('gives no auto-pass, and so no alert, when every team playing has been used: the list starts again', () => {
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
        const result = tick(state, cutoffOf(3))

        expect(result.alerts).toEqual([])
        expect(result.picks).toEqual([
            { entryId: 'ann', week: 3, teamId: 'Arsenal', source: 'auto' },
            { entryId: 'bob', week: 3, teamId: 'Arsenal', source: 'auto' },
        ])
    })
})
