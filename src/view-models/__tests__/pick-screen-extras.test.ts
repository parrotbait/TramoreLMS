// Created by Claude driven by Eddie Long on 2026-11-22.
//
// The facts on the pick screen: what the crowd picked, the team
// we would pick for you, and why you are out. Every sentence a player reads is
// checked here, in very simple English.

import { describe, expect, it } from 'vitest'

import { autoAssign, computeStandings } from '@/engine'
import type { GameState } from '@/engine'
import { afterWeek, beforeCutoff, buildState, cutoffOf } from '@/engine/testing/builder'

import type { ViewContext } from '../context'
import { buildPickScreen } from '../pick-screen'
import { crowdLines, crowdOf, outCauseOf } from '../pick-screen-extras'

function contextOf(state: GameState, now: Date): ViewContext {
    return {
        state,
        standings: computeStandings(state, now),
        now,
        nameOf: (entryId) => {
            return entryId
        },
        plMatchdayOf: () => {
            return 11
        },
        crestOf: () => {
            return null
        },
    }
}

// Week 1: Arsenal won, Chelsea lost, Everton drew. Five players.
const week = buildState({
    weeks: [
        { fixtures: [['Arsenal', 'Chelsea', '2-0'], ['Everton', 'Fulham', '1-1'], ['Brentford', 'Leeds', '1-0']] },
        { fixtures: [['Arsenal', 'Everton'], ['Chelsea', 'Fulham'], ['Brentford', 'Leeds']] },
    ],
    entries: ['ann', 'bob', 'cat', 'dan', 'eve'],
    picks: { ann: ['Arsenal'], bob: ['Arsenal'], cat: ['Chelsea'], dan: ['Everton'], eve: ['Brentford'] },
})

describe('what the crowd picked', () => {
    const context = contextOf(week, afterWeek(1))

    it('finds the most popular team and how many picked it', () => {
        expect(crowdOf(context, 'ann', 1)).toEqual({ topTeamName: 'Arsenal', topCount: 2, total: 5, yourCount: 2 })
    })

    it('says how many others picked the same team', () => {
        const crowd = crowdOf(context, 'ann', 1)!

        expect(crowdLines(crowd, 'Arsenal')).toEqual([
            'Most popular pick: Arsenal, with 2 of 5 players.',
            'You picked Arsenal with 1 other player.',
        ])
    })

    it('says “only you” when nobody else picked the same team', () => {
        const crowd = crowdOf(context, 'cat', 1)!

        expect(crowdLines(crowd, 'Chelsea')).toEqual([
            'Most popular pick: Arsenal, with 2 of 5 players.',
            'Only you picked Chelsea.',
        ])
    })

    it('uses “others” for more than one', () => {
        const busy = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '1-0']] }],
            entries: ['a', 'b', 'c'],
            picks: { a: ['Arsenal'], b: ['Arsenal'], c: ['Arsenal'] },
        })
        const crowd = crowdOf(contextOf(busy, afterWeek(1)), 'a', 1)!

        expect(crowdLines(crowd, 'Arsenal')[1]).toBe('You picked Arsenal with 2 other players.')
    })

    it('says nothing about the player when they picked nothing', () => {
        const crowd = crowdOf(context, 'ann', 1)!

        expect(crowdLines(crowd, null)).toHaveLength(1)
    })

    it('breaks a tie by team name, so it never changes between visits', () => {
        const tied = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '1-0']] }],
            entries: ['a', 'b'],
            picks: { a: ['Everton'], b: ['Arsenal'] },
        })

        expect(crowdOf(contextOf(tied, afterWeek(1)), 'a', 1)?.topTeamName).toBe('Arsenal')
    })

    it('is nothing when nobody picked', () => {
        const none = buildState({ weeks: [{ fixtures: [['Arsenal', 'Chelsea']] }], entries: ['a'] })

        expect(crowdOf(contextOf(none, afterWeek(1)), 'a', 1)).toBeNull()
    })

    it('is not on the screen while picks are open, so picks cannot be seen early', () => {
        const open = buildPickScreen(contextOf(week, beforeCutoff(1)), 'ann', 1)

        expect(open.crowd).toBeNull()
        expect(open.crowdLines).toEqual([])
    })

    it('is on the screen once picks have closed', () => {
        const closed = buildPickScreen(contextOf(week, new Date(cutoffOf(1).getTime() + 60_000)), 'ann', 1)

        expect(closed.crowdLines[0]).toBe('Most popular pick: Arsenal, with 2 of 5 players.')
    })
})

describe('the team we pick if you do nothing', () => {
    it('is the first team the cut-off would give, and it matches what auto-assign does', () => {
        const nobodyPicked = buildState({
            weeks: [{ fixtures: [['Chelsea', 'Everton'], ['Arsenal', 'Fulham']] }],
            entries: ['ann'],
        })
        const state = contextOf(nobodyPicked, beforeCutoff(1))
        const model = buildPickScreen(state, 'ann', 1)

        expect(model.status).toBe('open')
        expect(model.fallbackTeamName).toBe('Arsenal')
        expect(autoAssign(nobodyPicked, cutoffOf(1), 1)[0]?.teamId).toBe('Arsenal')
    })

    it('skips a team the player has used', () => {
        const settled = buildState({
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '2-0'], ['Everton', 'Fulham', '1-0']] },
                { fixtures: [['Arsenal', 'Everton'], ['Chelsea', 'Fulham']] },
            ],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal'], bob: ['Everton'] },
        })

        expect(buildPickScreen(contextOf(settled, beforeCutoff(2)), 'ann', 2).fallbackTeamName).toBe('Chelsea')
    })

    it('is not shown once the player has picked, or when picks are closed', () => {
        const picked = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea'], ['Everton', 'Fulham']] }],
            entries: ['ann'],
            picks: { ann: ['Everton'] },
        })

        expect(buildPickScreen(contextOf(picked, beforeCutoff(1)), 'ann', 1).fallbackTeamName).toBeNull()
        expect(buildPickScreen(contextOf(week, afterWeek(1)), 'ann', 1).fallbackTeamName).toBeNull()
    })
})

describe('why a player is out', () => {
    // Week 1 settles with one winner, so cat and dan really are out.
    const context = contextOf(week, afterWeek(1))

    it('names the team, the score and the rule for a loss', () => {
        expect(outCauseOf(context, 'cat')).toBe('Week 1: You picked Chelsea. Arsenal 2–0 Chelsea. A loss is out.')
    })

    it('names the rule for a draw', () => {
        expect(outCauseOf(context, 'dan')).toBe('Week 1: You picked Everton. Everton 1–1 Fulham. A draw is out.')
    })

    it('is nothing for a player who is still in', () => {
        expect(outCauseOf(context, 'ann')).toBeNull()
    })

    it('is nothing when everyone went out together and all stayed in', () => {
        const allOut = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '0-1']] }],
            entries: ['ann'],
            picks: { ann: ['Arsenal'] },
        })

        expect(outCauseOf(contextOf(allOut, afterWeek(1)), 'ann')).toBeNull()
    })

    it('appears on the pick screen for an out player, and only then', () => {
        const dan = buildPickScreen(context, 'dan', 2)

        expect(dan.status).toBe('out')
        expect(dan.outCause).toBe('Week 1: You picked Everton. Everton 1–1 Fulham. A draw is out.')
        expect(buildPickScreen(context, 'ann', 2).outCause).toBeNull()
    })
})
