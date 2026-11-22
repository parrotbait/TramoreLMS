// Created by Claude driven by Eddie Long on 2026-11-22.
//
// When every team that plays is already used, the used list starts again. The
// pick screen must show the same list the engine uses, or a player would be
// told a team is used when the engine would accept it.

import { describe, expect, it } from 'vitest'

import { computeStandings } from '@/engine'
import type { GameState } from '@/engine'
import { afterWeek, buildState } from '@/engine/testing/builder'

import type { ViewContext } from '../context'
import { buildPickScreen } from '../pick-screen'

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

// ann and bob win every week, so the game goes on. Four teams, played over five weeks.
const season = buildState({
    weeks: [
        { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '1-0']] },
        { fixtures: [['Chelsea', 'Everton', '0-1'], ['Arsenal', 'Fulham', '2-0']] },
        { fixtures: [['Chelsea', 'Fulham', '1-0'], ['Arsenal', 'Everton', '1-0']] },
        { fixtures: [['Arsenal', 'Everton', '1-0']] },
        { fixtures: [['Arsenal', 'Everton', '-'], ['Chelsea', 'Fulham', '-']] },
    ],
    entries: ['ann', 'bob'],
    picks: {
        ann: ['Arsenal', 'Everton', 'Chelsea', 'Arsenal'],
        bob: ['Everton', 'Arsenal', 'Chelsea', 'Arsenal'],
    },
})

const teamsOf = (model: ReturnType<typeof buildPickScreen>) => {
    return model.fixtures.flatMap((fixture) => {
        return [fixture.home, fixture.away]
    })
}

describe('the pick screen when the used teams start again', () => {
    it('shows no team as used in a week where every team that plays is used', () => {
        // Week 4: only Arsenal v Everton play, and ann has used both.
        const model = buildPickScreen(contextOf(season, afterWeek(3)), 'ann', 4)

        expect(model.status).toBe('open')
        expect(teamsOf(model).map((team) => {
            return [team.name, team.state, team.usedInWeek]
        })).toEqual([['Arsenal', 'available', null], ['Everton', 'available', null]])
    })

    it('shows a team as used again after the restart, with the week it was used', () => {
        // Week 5: ann picked Arsenal in Week 4, after the restart. Only Arsenal is used now.
        const model = buildPickScreen(contextOf(season, afterWeek(4)), 'ann', 5)
        const byName = new Map(teamsOf(model).map((team) => {
            return [team.name, team]
        }))

        expect(byName.get('Arsenal')).toMatchObject({ state: 'used', usedInWeek: 4 })
        expect(byName.get('Everton')).toMatchObject({ state: 'available', usedInWeek: null })
        expect(byName.get('Chelsea')).toMatchObject({ state: 'available' })
    })

    it('shows a used team as used while any unused team still plays', () => {
        // Week 3: Chelsea and Fulham play and ann has not used them, so Arsenal stays used.
        const model = buildPickScreen(contextOf(season, afterWeek(2)), 'ann', 3)
        const arsenal = teamsOf(model).find((team) => {
            return team.name === 'Arsenal'
        })

        expect(arsenal).toMatchObject({ state: 'used', usedInWeek: 1 })
    })
})
