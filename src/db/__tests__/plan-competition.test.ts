// Created by Claude driven by Eddie Long on 2026-10-31.

import { describe, expect, it } from 'vitest'

import type { FeedMatch } from '@/feeds/types'

import { planCompetition } from '../plan-competition'

function match(externalId: number, matchday: number, home: string, away: string, kickoff: string): FeedMatch {
    return {
        externalId,
        matchday,
        kickoffAt: new Date(kickoff),
        status: 'scheduled',
        home: { name: home, crestUrl: null },
        away: { name: away, crestUrl: null },
        score: null,
    }
}

const season = [
    match(1, 10, 'Arsenal', 'Chelsea', '2026-11-06T20:00:00Z'),
    match(2, 11, 'Chelsea', 'Brighton & Hove Albion', '2026-11-21T15:00:00Z'),
    match(3, 11, 'Arsenal', 'Bournemouth', '2026-11-21T12:30:00Z'),
    match(4, 12, 'Bournemouth', 'Arsenal', '2026-11-28T15:00:00Z'),
]

describe('planCompetition', () => {
    const plan = planCompetition(season, 11, 12)

    it('includes every team in the season, sorted by name', () => {
        expect(plan.teams).toEqual([
            { fullName: 'Arsenal', slug: 'arsenal' },
            { fullName: 'Bournemouth', slug: 'bournemouth' },
            { fullName: 'Brighton & Hove Albion', slug: 'brighton-and-hove-albion' },
            { fullName: 'Chelsea', slug: 'chelsea' },
        ])
    })

    it('makes one week per matchday from the start', () => {
        expect(plan.weeks).toEqual([{ number: 1, plMatchday: 11 }, { number: 2, plMatchday: 12 }])
    })

    it('leaves out matchdays before the start, and orders fixtures by kick-off', () => {
        expect(plan.fixtures.map((fixture) => {
            return [fixture.weekNumber, fixture.externalId]
        })).toEqual([[1, 3], [1, 2], [2, 4]])
    })

    it('rejects a start matchday outside the season', () => {
        expect(() => {
            return planCompetition(season, 39)
        }).toThrow('between 1 and 38')
    })
})
