// Created by Claude driven by Eddie Long on 2026-11-22.
//
// A draw must NEVER read “through”. This is the core rule of the game, so it is
// checked for every scoreline, from every side, in every situation that can
// keep a player in the game, through the real engine and the real screen.

import { describe, expect, it } from 'vitest'

import { computeStandings } from '@/engine'
import type { GameState } from '@/engine'
import { afterWeek, buildState } from '@/engine/testing/builder'

import type { ViewContext } from '../context'
import { buildPickScreen, describePickResult } from '../pick-screen'
import type { PickResult } from '../pick-screen'

const SCORES = [0, 1, 2, 3, 4, 5]

function contextOf(state: GameState): ViewContext {
    const now = afterWeek(1)
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

/** What `ann` sees on the game that holds her pick. */
function annSees(state: GameState): PickResult | null {
    const model = buildPickScreen(contextOf(state), 'ann', 1)
    return model.fixtures.find((fixture) => {
        return fixture.pickResult !== null
    })?.pickResult ?? null
}

function outcomeOf(state: GameState, entryId: string) {
    return computeStandings(state, afterWeek(1)).entries.get(entryId)?.weeks[0]
}

describe('a draw is never “through”', () => {
    // bob picks Everton, who win, so the week does not end with everyone out.
    const world = (score: string, annPicks: string) => {
        return buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', score], ['Everton', 'Fulham', '3-0']] }],
            entries: ['ann', 'bob'],
            picks: { ann: [annPicks], bob: ['Everton'] },
        })
    }

    for (const home of SCORES) {
        for (const away of SCORES) {
            const score = `${home}-${away}`

            it(`${score}, picking the home side: through only if home won`, () => {
                const state = world(score, 'Arsenal')

                expect(outcomeOf(state, 'ann')?.outcome).toBe(home > away ? 'through' : 'out')
                expect(annSees(state)?.kind).toBe(home > away ? 'through' : 'out')
            })

            it(`${score}, picking the away side: through only if away won`, () => {
                const state = world(score, 'Chelsea')

                expect(outcomeOf(state, 'ann')?.outcome).toBe(away > home ? 'through' : 'out')
                expect(annSees(state)?.kind).toBe(away > home ? 'through' : 'out')
            })
        }
    }

    it('every drawn scoreline says “out” on the screen, and never the word “through”', () => {
        for (const goals of SCORES) {
            const seen = annSees(world(`${goals}-${goals}`, 'Arsenal'))

            expect(seen?.kind).toBe('out')
            expect(seen?.text).toContain('out')
            expect(seen?.text).not.toContain('through')
        }
    })
})

describe('when everyone goes out together, all stay in, and the screen says why', () => {
    const everyoneOut = (score: string) => {
        return buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', score], ['Everton', 'Fulham', '0-0']] }],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal'], bob: ['Everton'] },
        })
    }

    it('keeps them in, which is the rule, but never calls a draw “through”', () => {
        const state = everyoneOut('1-1')

        expect(outcomeOf(state, 'ann')).toMatchObject({ outcome: 'out', reason: 'draw', reinstated: true })
        const seen = annSees(state)
        expect(seen?.kind).toBe('staysIn')
        expect(seen?.text).toContain('everyone went out')
        expect(seen?.text).not.toContain('through')
    })

    it('does the same for a loss', () => {
        const seen = annSees(everyoneOut('0-1'))

        expect(seen?.kind).toBe('staysIn')
        expect(seen?.text).not.toContain('through')
    })

    it('does not apply when even one player wins, so a draw is then out for real', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '1-1'], ['Everton', 'Fulham', '2-0']] }],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal'], bob: ['Everton'] },
        })

        expect(outcomeOf(state, 'ann')).toMatchObject({ outcome: 'out', reinstated: false })
        expect(annSees(state)?.kind).toBe('out')
    })

    it('does not apply while anyone’s result is still to come', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '1-1'], ['Everton', 'Fulham', '-']] }],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal'], bob: ['Everton'] },
        })

        expect(outcomeOf(state, 'ann')).toMatchObject({ outcome: 'out', reinstated: false })
        expect(annSees(state)?.kind).toBe('out')
    })
})

describe('the only ways to be “through” are a win, a game called off, a pass, or the organiser', () => {
    it('is through for a win', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '2-1'], ['Everton', 'Fulham', '0-1']] }],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal'], bob: ['Everton'] },
        })

        expect(outcomeOf(state, 'ann')).toMatchObject({ outcome: 'through', reason: 'win' })
        expect(annSees(state)).toEqual({ kind: 'through', text: 'You’re through ✓' })
    })

    it('is through when the game is called off after the cut-off, and says so', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', 'PL'], ['Everton', 'Fulham', '0-1']] }],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal'], bob: ['Everton'] },
        })

        expect(outcomeOf(state, 'ann')).toMatchObject({ outcome: 'through', reason: 'void' })
        expect(annSees(state)?.text).toBe('Game called off. You’re through ✓')
    })

    it('is through when an admin overrides a drawn game to a win for the player’s team, and the override is a real result', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '1-1', '2-1'], ['Everton', 'Fulham', '0-1']] }],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal'], bob: ['Everton'] },
        })

        expect(outcomeOf(state, 'ann')).toMatchObject({ outcome: 'through', reason: 'win' })
    })

    it('is through when the organiser says so, and the screen says that', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '1-1'], ['Everton', 'Fulham', '0-1']] }],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal'], bob: ['Everton'] },
            pickOverrides: [['ann', 1, 'through']],
        })

        expect(outcomeOf(state, 'ann')).toMatchObject({ outcome: 'through', reason: 'pickOverride' })
        expect(annSees(state)?.text).toBe('The organiser put you through ✓')
    })
})

describe('describePickResult', () => {
    it('only ever says “through” for an outcome of through', () => {
        const outcomes = ['through', 'out', 'pending'] as const
        const reasons = [
            'awaitingCutoff', 'awaitingPick', 'awaitingResult', 'win', 'draw', 'loss', 'void', 'pass', 'pickOverride',
        ] as const

        for (const outcome of outcomes) {
            for (const reason of reasons) {
                for (const reinstated of [false, true]) {
                    const result = describePickResult({ outcome, reason, reinstated })

                    if (outcome !== 'through') {
                        expect(result.kind).not.toBe('through')
                        expect(result.text).not.toContain('through')
                    }
                }
            }
        }
    })

    it('never says “through” for a draw or a loss, however the flags are set', () => {
        for (const reason of ['draw', 'loss'] as const) {
            for (const reinstated of [false, true]) {
                const result = describePickResult({ outcome: 'out', reason, reinstated })

                expect(result.kind).not.toBe('through')
                expect(result.text).not.toContain('through')
            }
        }
    })

    it('shows an impossible “through” (a through with no win, void, pass or override) as still being checked', () => {
        for (const reason of ['draw', 'loss', 'awaitingResult', 'awaitingPick', 'awaitingCutoff'] as const) {
            const result = describePickResult({ outcome: 'through', reason, reinstated: false })

            expect(result.kind).toBe('waiting')
            expect(result.text).not.toContain('through')
        }
    })
})
