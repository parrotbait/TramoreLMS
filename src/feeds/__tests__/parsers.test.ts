// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Recorded-style responses, shaped like the real APIs.

import { describe, expect, it } from 'vitest'

import { mapFootballDataStatus, parseFootballData } from '../football-data'
import type { FootballDataResponse } from '../football-data'
import { mapFplTeamName, parseFpl } from '../fpl'
import type { FplBootstrap, FplFixtures } from '../fpl'

const footballData: FootballDataResponse = {
    matches: [
        {
            id: 540001,
            matchday: 11,
            utcDate: '2026-11-21T12:30:00Z',
            status: 'FINISHED',
            homeTeam: { id: 57, name: 'Arsenal FC', crest: 'https://crests.football-data.org/57.png' },
            awayTeam: { id: 1044, name: 'AFC Bournemouth', crest: 'https://crests.football-data.org/bournemouth.png' },
            score: { fullTime: { home: 2, away: 1 } },
        },
        {
            id: 540002,
            matchday: 11,
            utcDate: '2026-11-21T15:00:00Z',
            status: 'TIMED',
            homeTeam: { id: 397, name: 'Brighton & Hove Albion FC', crest: null },
            awayTeam: { id: 351, name: 'Nottingham Forest FC' },
            score: { fullTime: { home: null, away: null } },
        },
        {
            id: 540003,
            matchday: 11,
            utcDate: '2026-11-22T14:00:00Z',
            status: 'POSTPONED',
            homeTeam: { id: 73, name: 'Tottenham Hotspur FC' },
            awayTeam: { id: 66, name: 'Manchester United FC' },
            score: { fullTime: { home: null, away: null } },
        },
        {
            id: 540004,
            matchday: null,
            utcDate: '2027-01-01T15:00:00Z',
            status: 'SCHEDULED',
            homeTeam: { id: null, name: null },
            awayTeam: { id: null, name: null },
            score: { fullTime: { home: null, away: null } },
        },
    ],
}

describe('parseFootballData', () => {
    const matches = parseFootballData(footballData)

    it('skips matches without both teams', () => {
        expect(matches).toHaveLength(3)
    })

    it('uses our club names', () => {
        expect(matches.map((match) => {
            return [match.home.name, match.away.name]
        })).toEqual([
            ['Arsenal', 'Bournemouth'],
            ['Brighton & Hove Albion', 'Nottingham Forest'],
            ['Tottenham Hotspur', 'Manchester United'],
        ])
    })

    it('keeps the score only for finished matches', () => {
        expect(matches[0]?.score).toEqual({ home: 2, away: 1 })
        expect(matches[1]?.score).toBeNull()
    })

    it('reads status, kick-off time and crest', () => {
        expect(matches[0]).toMatchObject({
            externalId: 540001,
            matchday: 11,
            status: 'finished',
            kickoffAt: new Date('2026-11-21T12:30:00Z'),
            home: { crestUrl: 'https://crests.football-data.org/57.png' },
        })
        expect(matches[2]?.status).toBe('postponed')
    })

    it.each([
        ['SCHEDULED', 'scheduled'],
        ['TIMED', 'scheduled'],
        ['IN_PLAY', 'inPlay'],
        ['PAUSED', 'inPlay'],
        ['FINISHED', 'finished'],
        ['AWARDED', 'finished'],
        ['POSTPONED', 'postponed'],
        ['CANCELLED', 'cancelled'],
        ['SUSPENDED', 'abandoned'],
    ])('maps %s to %s', (status, expected) => {
        expect(mapFootballDataStatus(status)).toBe(expected)
    })

    it('rejects a response that is not shaped like the API', () => {
        expect(() => {
            return parseFootballData({ matches: [{ id: 'x' }] })
        }).toThrow()
    })
})

const ourNames = [
    'Arsenal',
    'Bournemouth',
    'Brighton & Hove Albion',
    'Coventry City',
    'Manchester United',
    'Nottingham Forest',
    'Tottenham Hotspur',
]

describe('mapFplTeamName (Decision 8)', () => {
    it.each([
        ['Spurs', 'Tottenham Hotspur'],
        ['Man Utd', 'Manchester United'],
        ['Nott\'m Forest', 'Nottingham Forest'],
        ['Brighton', 'Brighton & Hove Albion'],
        ['Coventry', 'Coventry City'],
        ['Arsenal', 'Arsenal'],
    ])('maps "%s" to "%s"', (fplName, expected) => {
        expect(mapFplTeamName(fplName, ourNames)).toBe(expected)
    })

    it('returns null for a name it cannot place', () => {
        expect(mapFplTeamName('Atlético', ourNames)).toBeNull()
    })
})

describe('parseFpl', () => {
    const bootstrap: FplBootstrap = {
        teams: [
            { id: 1, name: 'Arsenal' },
            { id: 3, name: 'Bournemouth' },
            { id: 5, name: 'Brighton' },
            { id: 16, name: 'Nott\'m Forest' },
            { id: 99, name: 'Mystery FC' },
        ],
    }
    const fixtures: FplFixtures = [
        {
            id: 101,
            event: 11,
            kickoff_time: '2026-11-21T12:30:00Z',
            team_h: 1,
            team_a: 3,
            team_h_score: 2,
            team_a_score: 1,
            started: true,
            finished: true,
        },
        {
            id: 102,
            event: 11,
            kickoff_time: '2026-11-21T15:00:00Z',
            team_h: 5,
            team_a: 16,
            team_h_score: 1,
            team_a_score: 0,
            started: true,
            finished: false,
        },
        {
            id: 103,
            event: null,
            kickoff_time: null,
            team_h: 5,
            team_a: 1,
            team_h_score: null,
            team_a_score: null,
            started: false,
            finished: false,
        },
    ]
    const result = parseFpl(bootstrap, fixtures, ourNames)

    it('lists FPL teams it could not map', () => {
        expect(result.unmappedTeams).toEqual(['Mystery FC'])
    })

    it('skips fixtures with no kick-off time (postponed in FPL)', () => {
        expect(result.matches).toHaveLength(2)
    })

    it('only gives a score once FPL marks the match finished', () => {
        expect(result.matches[0]).toMatchObject({ status: 'finished', score: { home: 2, away: 1 } })
        expect(result.matches[1]).toMatchObject({ status: 'inPlay', score: null })
    })

    it('uses our names for both teams', () => {
        expect(result.matches[1]).toMatchObject({
            home: { name: 'Brighton & Hove Albion' },
            away: { name: 'Nottingham Forest' },
        })
    })
})
