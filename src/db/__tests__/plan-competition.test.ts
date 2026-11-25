// Created by Claude driven by Eddie Long on 2026-10-31.

import { describe, expect, it } from 'vitest'

import type { FeedMatch } from '@/feeds/types'

import { describeScheduleProblems, planCompetition, scheduleProblems } from '../plan-competition'

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

describe('scheduleProblems', () => {
    // Four teams, two weeks. Everyone plays once in each.
    const full = [
        match(1, 11, 'Arsenal', 'Chelsea', '2026-11-21T15:00:00Z'),
        match(2, 11, 'Everton', 'Fulham', '2026-11-21T15:00:00Z'),
        match(3, 12, 'Arsenal', 'Everton', '2026-11-28T15:00:00Z'),
        match(4, 12, 'Chelsea', 'Fulham', '2026-11-28T15:00:00Z'),
    ]

    it('finds none when every team plays once in every week', () => {
        expect(scheduleProblems(planCompetition(full, 11, 12))).toEqual([])
    })

    it('names a team with no game, and says which matchday', () => {
        const withoutOne = full.filter((match) => {
            return match.externalId !== 4
        })

        expect(scheduleProblems(planCompetition(withoutOne, 11, 12))).toEqual([
            'PL Matchday 12: Chelsea has no game.',
            'PL Matchday 12: Fulham has no game.',
        ])
    })

    it('finds a team that plays twice in one week', () => {
        const extra = match(9, 11, 'Arsenal', 'Fulham', '2026-11-22T15:00:00Z')

        expect(scheduleProblems(planCompetition([...full, extra], 11, 12))).toEqual([
            'PL Matchday 11: Arsenal plays 2 games.',
            'PL Matchday 11: Fulham plays 2 games.',
        ])
    })

    it('keeps the message short', () => {
        const message = describeScheduleProblems(['a.', 'b.', 'c.', 'd.', 'e.'])

        expect(message).toContain('a. b. c.')
        expect(message).toContain('(and 2 more)')
    })
})
