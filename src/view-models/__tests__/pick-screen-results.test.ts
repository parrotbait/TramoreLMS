// Created by Claude driven by Eddie Long on 2026-11-22.
//
// Once a game is played, the pick screen shows the score. On the game that
// holds the player’s own pick, it also says whether they are through.

import { describe, expect, it } from 'vitest'

import { computeStandings } from '@/engine'
import type { GameState } from '@/engine'
import { buildState, cutoffOf } from '@/engine/testing/builder'

import type { ViewContext } from '../context'
import { buildPickScreen } from '../pick-screen'

const afterCutoff = new Date(cutoffOf(1).getTime() + 60 * 60 * 1000)

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

function stateWith(arsenalGame: [string, string, string?]): GameState {
    return buildState({
        weeks: [{ fixtures: [arsenalGame, ['Everton', 'Fulham', '0-3']] }],
        entries: ['ann', 'bob'],
        picks: { ann: ['Arsenal'], bob: ['Fulham'] },
    })
}

function resultsOf(state: GameState, now: Date) {
    const model = buildPickScreen(contextOf(state, now), 'ann', 1)

    return {
        arsenal: model.fixtures[0],
        other: model.fixtures[1],
    }
}

describe('results on the pick screen', () => {
    it('says “through” on the game where the player’s team won', () => {
        const { arsenal } = resultsOf(stateWith(['Arsenal', 'Chelsea', '2-0']), afterCutoff)

        expect(arsenal?.scoreLabel).toBe('2–0')
        expect(arsenal?.pickResult).toEqual({ kind: 'through', text: 'You’re through ✓' })
    })

    it('says “out” on the game where the player’s team lost', () => {
        const { arsenal } = resultsOf(stateWith(['Arsenal', 'Chelsea', '0-1']), afterCutoff)

        expect(arsenal?.pickResult).toEqual({ kind: 'out', text: 'You lost. You’re out ✗' })
    })

    it('says “out” on a draw', () => {
        const { arsenal } = resultsOf(stateWith(['Arsenal', 'Chelsea', '1-1']), afterCutoff)

        expect(arsenal?.pickResult).toEqual({ kind: 'out', text: 'A draw is out. You’re out ✗' })
    })

    it('says “waiting” while the player’s game is not played', () => {
        const { arsenal } = resultsOf(stateWith(['Arsenal', 'Chelsea']), afterCutoff)

        expect(arsenal?.scoreLabel).toBeNull()
        expect(arsenal?.pickResult).toEqual({ kind: 'waiting', text: 'Waiting for result' })
    })

    it('says nothing on a game that is not the player’s', () => {
        const { other } = resultsOf(stateWith(['Arsenal', 'Chelsea', '2-0']), afterCutoff)

        expect(other?.scoreLabel).toBe('0–3')
        expect(other?.pickResult).toBeNull()
    })

    it('says nothing before the cut-off, while picks are open', () => {
        const before = new Date(cutoffOf(1).getTime() - 60 * 60 * 1000)
        const { arsenal } = resultsOf(stateWith(['Arsenal', 'Chelsea']), before)

        expect(arsenal?.pickResult).toBeNull()
    })

    it('never says “through” for a loss, even when everyone went out together and all stay in', () => {
        const everyoneOut = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '0-1']] }],
            entries: ['ann'],
            picks: { ann: ['Arsenal'] },
        })

        const result = resultsOf(everyoneOut, afterCutoff).arsenal?.pickResult
        expect(result?.kind).toBe('staysIn')
        expect(result?.text).toContain('everyone went out')
        expect(result?.text).not.toContain('through')
    })
})
