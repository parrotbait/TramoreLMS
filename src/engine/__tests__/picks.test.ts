// Created by Claude driven by Eddie Long on 2026-10-31.

import { describe, expect, it } from 'vitest'

import {
    autoAssign,
    availableTeams,
    computeStandings,
    pickNeedsReplacing,
    validatePick,
} from '../index'
import { afterWeek, beforeCutoff, buildState, cutoffOf, withPicks } from '../testing/builder'

const twoWeeks = {
    weeks: [
        { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '0-1']] },
        { fixtures: [['Arsenal', 'Everton', '-'], ['Chelsea', 'Fulham', '-']] },
    ],
    entries: ['ann', 'bob', 'cat'],
    picks: { ann: ['Arsenal'], bob: ['Fulham'], cat: ['Chelsea'] },
} as const

describe('validatePick: the cut-off (Decision 12)', () => {
    const state = buildState(twoWeeks)
    const oneMs = 1

    it('accepts a pick 1 ms before the cut-off', () => {
        const now = new Date(cutoffOf(2).getTime() - oneMs)
        expect(validatePick(state, now, 'ann', 2, 'Chelsea')).toEqual({ ok: true })
    })

    it('rejects a pick at the cut-off itself', () => {
        expect(validatePick(state, cutoffOf(2), 'ann', 2, 'Chelsea')).toEqual({ ok: false, reason: 'cutoffPassed' })
    })

    it('rejects a pick for a week that has not opened', () => {
        const unopened = buildState({
            ...twoWeeks,
            weeks: [twoWeeks.weeks[0], { ...twoWeeks.weeks[1], open: false }],
        })
        expect(validatePick(unopened, afterWeek(1), 'ann', 2, 'Chelsea')).toEqual({ ok: false, reason: 'weekNotOpen' })
    })

    it('rejects a week that does not exist', () => {
        expect(validatePick(state, afterWeek(1), 'ann', 9, 'Chelsea')).toEqual({ ok: false, reason: 'unknownWeek' })
    })
})

describe('validatePick: rule 2, each team once', () => {
    const state = buildState(twoWeeks)

    it('rejects a team the player has already used', () => {
        expect(validatePick(state, afterWeek(1), 'ann', 2, 'Arsenal')).toEqual({ ok: false, reason: 'teamUsed' })
    })

    it('accepts a team another player has used', () => {
        expect(validatePick(state, afterWeek(1), 'bob', 2, 'Arsenal')).toEqual({ ok: true })
    })

    it('greys out used teams in the available list', () => {
        const standings = computeStandings(state, afterWeek(1))
        const names = availableTeams(state, standings, 'ann', 2, afterWeek(1)).map((team) => {
            return team.id
        })
        expect(names).toEqual(['Chelsea', 'Everton', 'Fulham'])
    })
})

describe('validatePick: eligibility', () => {
    it('rejects a player who is out', () => {
        const state = buildState(twoWeeks)
        expect(validatePick(state, afterWeek(1), 'cat', 2, 'Everton')).toEqual({ ok: false, reason: 'notEligible' })
    })

    it('lets a player pick next week once their own result is through (Decision 20)', () => {
        const state = buildState({
            ...twoWeeks,
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '-']] },
                twoWeeks.weeks[1],
            ],
        })
        expect(validatePick(state, afterWeek(1), 'ann', 2, 'Everton')).toEqual({ ok: true })
    })

    it('does not let a provisionally-out player pick next week', () => {
        const state = buildState({
            ...twoWeeks,
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '-']] },
                twoWeeks.weeks[1],
            ],
        })
        expect(validatePick(state, afterWeek(1), 'cat', 2, 'Everton')).toEqual({ ok: false, reason: 'notEligible' })
    })

    it('does not let a player whose result is pending pick next week', () => {
        const state = buildState({
            ...twoWeeks,
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '-']] },
                twoWeeks.weeks[1],
            ],
        })
        expect(validatePick(state, afterWeek(1), 'bob', 2, 'Everton')).toEqual({ ok: false, reason: 'notEligible' })
    })
})

describe('Postponed before the cut-off: pick again (Decision 7, case 1)', () => {
    const state = buildState({
        weeks: [{ fixtures: [['Arsenal', 'Chelsea', 'P'], ['Everton', 'Fulham', '-']] }],
        entries: ['ann'],
        picks: { ann: ['Arsenal'] },
    })
    const now = beforeCutoff(1)

    it('hides the postponed teams', () => {
        const standings = computeStandings(state, now)
        const names = availableTeams(state, standings, 'ann', 1, now).map((team) => {
            return team.id
        })
        expect(names).toEqual(['Everton', 'Fulham'])
    })

    it('rejects a new pick on a postponed team', () => {
        expect(validatePick(state, now, 'ann', 1, 'Chelsea')).toEqual({ ok: false, reason: 'teamNotAvailable' })
    })

    it('flags the existing pick as needing replacing', () => {
        expect(pickNeedsReplacing(state, now, 'ann', 1)).toBe(true)
    })

    it('does not flag a pick that is still valid', () => {
        const valid = withPicks(state, [{ entryId: 'ann', week: 1, teamId: 'Everton', source: 'player' }])
        expect(pickNeedsReplacing(valid, now, 'ann', 1)).toBe(false)
    })

    it('counts a postponement recorded at this very instant', () => {
        const base = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea'], ['Everton', 'Fulham']] }],
            entries: ['ann'],
            picks: { ann: ['Arsenal'] },
        })
        const postponedNow = {
            ...base,
            fixtures: base.fixtures.map((fixture, index) => {
                return index === 0 ? { ...fixture, state: { kind: 'postponed' as const, at: now } } : fixture
            }),
        }
        expect(pickNeedsReplacing(postponedNow, now, 'ann', 1)).toBe(true)
    })
})

describe('autoAssign: rule 4 (Decision 8)', () => {
    it('does nothing before the cut-off', () => {
        const state = buildState({ weeks: [{ fixtures: [['Arsenal', 'Chelsea', '-']] }], entries: ['ann'] })
        expect(autoAssign(state, beforeCutoff(1), 1)).toEqual([])
    })

    it('assigns the first team alphabetically by full name', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Chelsea', 'Arsenal', '-'], ['Everton', 'Brentford', '-']] }],
            entries: ['ann'],
        })
        expect(autoAssign(state, cutoffOf(1), 1)).toEqual([
            { entryId: 'ann', week: 1, teamId: 'Arsenal', source: 'auto' },
        ])
    })

    it('sorts "Bournemouth" after "Arsenal" (the team list drops the "AFC")', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Bournemouth', 'Arsenal', '-']] }],
            entries: ['ann'],
        })
        expect(autoAssign(state, cutoffOf(1), 1)[0]?.teamId).toBe('Arsenal')
    })

    it('skips teams the player has used', () => {
        const state = buildState(twoWeeks)
        const assigned = autoAssign(state, cutoffOf(2), 2)
        expect(assigned).toEqual([
            { entryId: 'ann', week: 2, teamId: 'Chelsea', source: 'auto' },
            { entryId: 'bob', week: 2, teamId: 'Arsenal', source: 'auto' },
        ])
    })

    it('skips teams whose match was postponed before the cut-off', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', 'P'], ['Everton', 'Fulham', '-']] }],
            entries: ['ann'],
        })
        expect(autoAssign(state, cutoffOf(1), 1)[0]?.teamId).toBe('Everton')
    })

    it('can assign a team whose match was postponed after the cut-off', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', 'PL'], ['Everton', 'Fulham', '-']] }],
            entries: ['ann'],
        })
        expect(autoAssign(state, afterWeek(1), 1)[0]?.teamId).toBe('Arsenal')
    })

    it('replaces a pick whose match was postponed before the cut-off', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', 'P'], ['Everton', 'Fulham', '-']] }],
            entries: ['ann'],
            picks: { ann: ['Chelsea'] },
        })
        expect(autoAssign(state, cutoffOf(1), 1)).toEqual([
            { entryId: 'ann', week: 1, teamId: 'Everton', source: 'auto' },
        ])
    })

    it('leaves valid player picks alone', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '-']] }],
            entries: ['ann'],
            picks: { ann: ['Chelsea'] },
        })
        expect(autoAssign(state, cutoffOf(1), 1)).toEqual([])
    })

    it('returns nothing new on a second run', () => {
        const state = buildState({ weeks: [{ fixtures: [['Arsenal', 'Chelsea', '-']] }], entries: ['ann', 'bob'] })
        const first = autoAssign(state, cutoffOf(1), 1)
        const second = autoAssign(withPicks(state, first), cutoffOf(1), 1)

        expect(first).toHaveLength(2)
        expect(second).toEqual([])
    })

    it('gives an auto-pass when every team playing has been used', () => {
        const state = buildState({
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '1-0']] },
                { fixtures: [['Chelsea', 'Everton', '0-1'], ['Arsenal', 'Fulham', '0-0']] },
                { fixtures: [['Arsenal', 'Everton', '-']] },
            ],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal', 'Everton'], bob: ['Everton', 'Arsenal'] },
            pickOverrides: [['bob', 2, 'through']],
        })
        expect(autoAssign(state, cutoffOf(3), 3)).toEqual([
            { entryId: 'ann', week: 3, teamId: null, source: 'autoPass' },
            { entryId: 'bob', week: 3, teamId: null, source: 'autoPass' },
        ])
    })

    it('skips entries with a pick override for the week', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '-']] }],
            entries: ['ann'],
            pickOverrides: [['ann', 1, 'through']],
        })
        expect(autoAssign(state, cutoffOf(1), 1)).toEqual([])
    })

    it('skips players who are out', () => {
        const state = buildState(twoWeeks)
        const entryIds = autoAssign(state, cutoffOf(2), 2).map((pick) => {
            return pick.entryId
        })
        expect(entryIds).not.toContain('cat')
    })

    it('assigns late players once the previous week settles', () => {
        const unsettled = buildState({
            ...twoWeeks,
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '-']] },
                twoWeeks.weeks[1],
            ],
        })
        const firstRun = autoAssign(unsettled, cutoffOf(2), 2)
        expect(firstRun.map((pick) => {
            return pick.entryId
        })).toEqual(['ann'])

        const settled = withPicks(buildState(twoWeeks), firstRun)
        const secondRun = autoAssign(settled, afterWeek(2), 2)
        expect(secondRun).toEqual([{ entryId: 'bob', week: 2, teamId: 'Arsenal', source: 'auto' }])
    })
})
