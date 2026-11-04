// Created by Claude driven by Eddie Long on 2026-11-04.

import { describe, expect, it } from 'vitest'

import { computeStandings } from '@/engine'
import type { GameState } from '@/engine'
import { afterWeek, beforeCutoff, buildState } from '@/engine/testing/builder'
import type { ViewContext } from '@/view-models/context'

import { picksImageModel, reminderText, statusImageModel } from '../models'
import type { ShareSettings } from '../models'

const settings: ShareSettings = {
    competitionName: 'Last Man Standing 2026/27',
    siteUrl: 'https://tramorelastmanstanding.vercel.app/',
    prizeCents: 30_000,
    buybackFeeCents: 500,
}

function contextOf(state: GameState, now: Date): ViewContext {
    return {
        state,
        standings: computeStandings(state, now),
        now,
        nameOf: (entryId) => {
            return entryId
        },
        plMatchdayOf: (weekNumber) => {
            return weekNumber + 11
        },
        crestOf: () => {
            return null
        },
    }
}

const state = buildState({
    weeks: [
        { fixtures: [['Arsenal', 'Chelsea', '2-0'], ['Everton', 'Fulham', '1-1']] },
        { fixtures: [['Arsenal', 'Everton'], ['Chelsea', 'Fulham']] },
    ],
    entries: ['Aoife', 'Bríd', 'Ciarán', 'Dara'],
    picks: { Aoife: ['Arsenal', 'Everton'], Bríd: ['Arsenal'], Ciarán: ['Chelsea'], Dara: ['Everton'] },
})

describe('reminderText (Decision 11)', () => {
    const text = reminderText(contextOf(state, beforeCutoff(2)), settings, 2)

    it('shows the week, matchday and cut-off', () => {
        expect(text).toContain('Week 2 (PL Matchday 13)')
        expect(text).toMatch(/Cut-off: \w{3} \d{1,2} \w{3}, \d{2}:\d{2}/)
    })

    it('counts who is in and who has not picked, without naming anyone', () => {
        expect(text).toContain('2 still in · 1 haven’t picked yet')
        for (const name of ['Aoife', 'Bríd', 'Ciarán', 'Dara']) {
            expect(text).not.toContain(name)
        }
    })

    it('links to the pick page and the rules', () => {
        expect(text).toContain('Pick here 👉 https://tramorelastmanstanding.vercel.app/pick')
        expect(text).toContain('Rules: https://tramorelastmanstanding.vercel.app/rules')
    })

    it('mentions the buy-back before the Week 2 cut-off', () => {
        expect(text).toContain('Out in Week 1? Buy back in for €5.00 until')
    })

    it('does not mention the buy-back in Week 1', () => {
        expect(reminderText(contextOf(state, beforeCutoff(1)), settings, 1)).not.toContain('Buy back')
    })
})

describe('statusImageModel (Decision 16)', () => {
    const model = statusImageModel(contextOf(state, afterWeek(1)), settings, 1)

    it('lists who is still in by name, alphabetically', () => {
        expect(model.stillIn).toEqual(['Aoife', 'Bríd'])
        expect(model.headline).toBe('2 of 4 still standing')
    })

    it('lists who went out this week, with their team and the score', () => {
        expect(model.outThisWeek).toEqual([
            { name: 'Ciarán', teamName: 'Chelsea', scoreLabel: '2–0' },
            { name: 'Dara', teamName: 'Everton', scoreLabel: '1–1' },
        ])
    })

    it('shows the week, the prize, the next cut-off and the site', () => {
        expect(model.subtitle).toBe('After Week 1 · PL Matchday 12')
        expect(model.footer).toMatch(/^Prize €300\.00 · Next cut-off .+ · tramorelastmanstanding\.vercel\.app$/)
    })

    it('counts earlier eliminations instead of naming them', () => {
        const later = buildState({
            weeks: [
                { fixtures: [['Arsenal', 'Chelsea', '2-0'], ['Everton', 'Fulham', '1-1']] },
                { fixtures: [['Arsenal', 'Everton', '1-0'], ['Chelsea', 'Fulham', '2-0']] },
            ],
            entries: ['Aoife', 'Bríd', 'Ciarán', 'Dara'],
            picks: { Aoife: ['Arsenal', 'Chelsea'], Bríd: ['Arsenal', 'Fulham'], Ciarán: ['Chelsea'], Dara: ['Everton'] },
        })
        const afterTwo = statusImageModel(contextOf(later, afterWeek(2)), settings, 2)
        expect(afterTwo.outEarlier).toBe(2)
        expect(afterTwo.outThisWeek?.map((player) => {
            return player.name
        })).toEqual(['Bríd'])
    })

    it('shows counts only for a very big field', () => {
        const names = Array.from({ length: 151 }, (_, index) => {
            return `p${index}`
        })
        const big = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '1-0']] }],
            entries: names,
            picks: Object.fromEntries(names.map((name) => {
                return [name, ['Arsenal']]
            })),
        })
        const model151 = statusImageModel(contextOf(big, afterWeek(1)), settings, 1)
        expect(model151.stillIn).toBeNull()
        expect(model151.headline).toBe('151 of 151 still standing')
    })
})

describe('picksImageModel', () => {
    it('stays empty before the cut-off', () => {
        const model = picksImageModel(contextOf(state, beforeCutoff(1)), settings, 1)
        expect(model).toMatchObject({ isRevealed: false, teams: [] })
    })

    it('counts players per team after the cut-off, busiest first, with no names', () => {
        const model = picksImageModel(contextOf(state, afterWeek(1)), settings, 1)
        expect(model.teams.map((team) => {
            return [team.teamName, team.count]
        })).toEqual([['Arsenal', 2], ['Chelsea', 1], ['Everton', 1]])
        expect(model.total).toBe(4)
        expect(JSON.stringify(model)).not.toContain('Aoife')
    })
})
