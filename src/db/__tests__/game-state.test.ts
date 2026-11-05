// Created by Claude driven by Eddie Long on 2026-10-31.

import { describe, expect, it } from 'vitest'

import { computeStandings } from '@/engine'

import { fromFixtureState, toFixtureState, toGameState } from '../game-state'
import type { CompetitionRows } from '../game-state'

const created = new Date('2026-11-01T10:00:00Z')
const cutoff = new Date('2026-11-21T11:30:00Z')

const competition: CompetitionRows['competition'] = {
    id: 'c1',
    name: 'Test',
    season: 2026,
    startMatchday: 11,
    finalMatchday: 38,
    entryFeeCents: 1000,
    buybackFeeCents: 500,
    prizeCents: 30_000,
    entriesOpen: true,
    showRaised: false,
    status: 'running',
    isDemo: false,
    demoNow: null,
    createdAt: created,
}

const fixtureRow = (overrides: Partial<CompetitionRows['fixtures'][number]>): CompetitionRows['fixtures'][number] => {
    return {
        id: 'f1',
        competitionId: 'c1',
        weekId: 'w1',
        homeTeamId: 't-ars',
        awayTeamId: 't-che',
        kickoffAt: new Date('2026-11-21T12:30:00Z'),
        externalId: 1,
        state: 'scheduled',
        homeGoals: null,
        awayGoals: null,
        postponedAt: null,
        overrideKind: null,
        overrideHomeGoals: null,
        overrideAwayGoals: null,
        overrideReason: null,
        updatedAt: created,
        ...overrides,
    }
}

const entryRow = (id: string, overrides: Partial<CompetitionRows['entries'][number]> = {}): CompetitionRows['entries'][number] => {
    return {
        id,
        competitionId: 'c1',
        personId: `p-${id}`,
        displayName: id,
        displayNameKey: id,
        status: 'active',
        holdExpiresAt: null,
        boughtBack: false,
        withdrawnFromWeek: null,
        createdAt: created,
        ...overrides,
    }
}

const rows: CompetitionRows = {
    competition,
    teams: [
        { id: 't-ars', competitionId: 'c1', fullName: 'Arsenal', slug: 'arsenal', footballDataId: 57 },
        { id: 't-che', competitionId: 'c1', fullName: 'Chelsea', slug: 'chelsea', footballDataId: 61 },
    ],
    weeks: [
        { id: 'w1', competitionId: 'c1', number: 1, plMatchday: 11, cutoffAt: cutoff, cutoffOverridden: false, openedAt: created, settledAt: null },
        { id: 'w2', competitionId: 'c1', number: 2, plMatchday: 12, cutoffAt: null, cutoffOverridden: false, openedAt: null, settledAt: null },
    ],
    fixtures: [fixtureRow({ state: 'finished', homeGoals: 2, awayGoals: 0 })],
    entries: [
        entryRow('ann'),
        entryRow('bob'),
        entryRow('pending', { status: 'pending', holdExpiresAt: created }),
        entryRow('lapsed', { status: 'expired' }),
        entryRow('gone', { status: 'withdrawn', withdrawnFromWeek: 2 }),
    ],
    picks: [
        { id: 'k1', entryId: 'ann', weekId: 'w1', teamId: 't-ars', source: 'player', updatedAt: created },
        { id: 'k2', entryId: 'bob', weekId: 'w1', teamId: 't-che', source: 'auto', updatedAt: created },
        { id: 'k3', entryId: 'pending', weekId: 'w1', teamId: 't-ars', source: 'player', updatedAt: created },
    ],
    pickOverrides: [
        { entryId: 'bob', weekId: 'w1', outcome: 'through', reason: 'Holiday', actorEmail: 'admin@example.test', createdAt: created },
    ],
}

describe('toGameState', () => {
    const state = toGameState(rows)

    it('works out the final week from the start matchday', () => {
        expect(state.finalWeek).toBe(28)
    })

    it('uses week numbers, not week ids', () => {
        expect(state.fixtures[0]?.week).toBe(1)
        expect(state.picks.map((pick) => {
            return pick.week
        })).toEqual([1, 1])
        expect(state.weeks).toEqual([{ number: 1, cutoffAt: cutoff }, { number: 2, cutoffAt: null }])
    })

    it('leaves out pending and expired entries and their picks (Decision 18)', () => {
        expect(state.entries.map((entry) => {
            return entry.id
        })).toEqual(['ann', 'bob', 'gone'])
        expect(state.picks.some((pick) => {
            return pick.entryId === 'pending'
        })).toBe(false)
    })

    it('maps withdrawals to the week they start', () => {
        expect(state.entries.find((entry) => {
            return entry.id === 'gone'
        })).toEqual({ id: 'gone', boughtBack: false, withdrawnFromWeek: 2 })
    })

    it('carries pick sources and overrides through', () => {
        expect(state.picks[1]).toEqual({ entryId: 'bob', week: 1, teamId: 't-che', source: 'auto' })
        expect(state.pickOverrides).toEqual([{ entryId: 'bob', week: 1, outcome: 'through' }])
    })

    it('feeds the rules engine', () => {
        const standings = computeStandings(state, new Date('2026-11-22T12:00:00Z'))
        expect(standings.entries.get('ann')?.status).toBe('in')
        expect(standings.entries.get('bob')?.status).toBe('in')
    })
})

describe('fixture state round trip', () => {
    it.each([
        { kind: 'scheduled' as const },
        { kind: 'abandoned' as const },
        { kind: 'postponed' as const, at: cutoff },
        { kind: 'finished' as const, home: 3, away: 1 },
    ])('writes and reads $kind the same', (state) => {
        const columns = fromFixtureState(state)
        expect(toFixtureState(fixtureRow(columns))).toEqual(state)
    })

    it('maps an admin result override', () => {
        const state = toGameState({
            ...rows,
            fixtures: [fixtureRow({ overrideKind: 'result', overrideHomeGoals: 1, overrideAwayGoals: 1, overrideReason: 'Feed wrong' })],
        })
        expect(state.fixtures[0]?.override).toEqual({ kind: 'result', home: 1, away: 1 })
    })

    it('maps a void override', () => {
        const state = toGameState({ ...rows, fixtures: [fixtureRow({ overrideKind: 'void', overrideReason: 'Abandoned' })] })
        expect(state.fixtures[0]?.override).toEqual({ kind: 'void' })
    })

    it('throws on a finished fixture with no score, which the constraints should prevent', () => {
        expect(() => {
            return toFixtureState(fixtureRow({ state: 'finished' }))
        }).toThrow('has no home_goals')
    })
})
