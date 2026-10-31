// Created by Claude driven by Eddie Long on 2026-10-31.

import { describe, expect, it } from 'vitest'

import { syncFixtures } from '../sync'
import type { StoredFixture, SyncResult } from '../sync'
import type { FeedMatch } from '../types'

const CUTOFF = new Date('2026-11-21T11:30:00Z')
const KICKOFF = new Date('2026-11-21T12:30:00Z')
const SOON_AFTER = new Date('2026-11-21T14:30:00Z')
const LATE_THAT_NIGHT = new Date('2026-11-21T22:00:00Z')

function stored(overrides: Partial<StoredFixture> = {}): StoredFixture {
    return {
        id: 'f1',
        week: 1,
        homeTeamId: 'arsenal',
        awayTeamId: 'bournemouth',
        kickoffAt: KICKOFF,
        state: { kind: 'scheduled' },
        externalId: 540001,
        ...overrides,
    }
}

function feed(overrides: Partial<FeedMatch> = {}): FeedMatch {
    return {
        externalId: 540001,
        matchday: 11,
        kickoffAt: KICKOFF,
        status: 'scheduled',
        home: { name: 'Arsenal', crestUrl: null },
        away: { name: 'Bournemouth', crestUrl: null },
        score: null,
        ...overrides,
    }
}

function run(options: {
    readonly fixture?: StoredFixture
    readonly primary?: FeedMatch | null
    readonly secondary?: FeedMatch | null
    readonly now?: Date
}): SyncResult {
    return syncFixtures({
        fixtures: [options.fixture ?? stored()],
        weeks: [{ number: 1, cutoffAt: CUTOFF }],
        teamNames: new Map([['arsenal', 'Arsenal'], ['bournemouth', 'Bournemouth']]),
        primary: options.primary === null ? [] : [options.primary ?? feed()],
        secondary: options.secondary === null || options.secondary === undefined ? [] : [options.secondary],
        now: options.now ?? LATE_THAT_NIGHT,
    })
}

const finished21 = feed({ status: 'finished', score: { home: 2, away: 1 } })
const fplFinished = (home: number, away: number) => {
    return feed({ externalId: 9001, status: 'finished', score: { home, away } })
}

describe('syncFixtures: results (Decisions 3 and 20)', () => {
    it('applies a result when both feeds agree', () => {
        expect(run({ primary: finished21, secondary: fplFinished(2, 1) })).toEqual({
            changes: [{ kind: 'state', fixtureId: 'f1', state: { kind: 'finished', home: 2, away: 1 } }],
            alerts: [],
        })
    })

    it('holds the result when the feeds disagree', () => {
        expect(run({ primary: finished21, secondary: fplFinished(2, 2) })).toEqual({
            changes: [],
            alerts: [{ kind: 'resultHeld', fixtureId: 'f1', reason: 'scoresDisagree' }],
        })
    })

    it('waits while FPL catches up, for up to 6 hours after kick-off', () => {
        const fplPlaying = feed({ externalId: 9001, status: 'inPlay' })
        const result = run({ primary: finished21, secondary: fplPlaying, now: SOON_AFTER })
        expect(result).toEqual({ changes: [], alerts: [] })
    })

    it('holds the result when FPL still has nothing after 6 hours', () => {
        expect(run({ primary: finished21, secondary: null })).toEqual({
            changes: [],
            alerts: [{ kind: 'resultHeld', fixtureId: 'f1', reason: 'secondaryMissing' }],
        })
    })

    it('changes nothing when the stored result already matches', () => {
        const fixture = stored({ state: { kind: 'finished', home: 2, away: 1 } })
        expect(run({ fixture, primary: finished21, secondary: fplFinished(2, 1) })).toEqual({ changes: [], alerts: [] })
    })

    it('applies a corrected result and raises an alert', () => {
        const fixture = stored({ state: { kind: 'finished', home: 1, away: 1 } })
        expect(run({ fixture, primary: finished21, secondary: fplFinished(2, 1) })).toEqual({
            changes: [{ kind: 'state', fixtureId: 'f1', state: { kind: 'finished', home: 2, away: 1 } }],
            alerts: [{ kind: 'resultChanged', fixtureId: 'f1', from: { home: 1, away: 1 }, to: { home: 2, away: 1 } }],
        })
    })

    it('applies a confirmed result to an abandoned match', () => {
        const fixture = stored({ state: { kind: 'abandoned' } })
        expect(run({ fixture, primary: finished21, secondary: fplFinished(2, 1) }).changes).toEqual([
            { kind: 'state', fixtureId: 'f1', state: { kind: 'finished', home: 2, away: 1 } },
        ])
    })
})

describe('syncFixtures: postponements (Decision 7)', () => {
    it('postpones a match the feed marks postponed', () => {
        expect(run({ primary: feed({ status: 'postponed' }) }).changes).toEqual([
            { kind: 'state', fixtureId: 'f1', state: { kind: 'postponed', at: LATE_THAT_NIGHT } },
        ])
    })

    it('treats a cancelled match as postponed', () => {
        expect(run({ primary: feed({ status: 'cancelled' }) }).changes).toEqual([
            { kind: 'state', fixtureId: 'f1', state: { kind: 'postponed', at: LATE_THAT_NIGHT } },
        ])
    })

    it('treats a match rearranged more than 7 days after the cut-off as postponed', () => {
        const rearranged = feed({ kickoffAt: new Date('2027-02-10T19:45:00Z') })
        expect(run({ primary: rearranged }).changes).toEqual([
            { kind: 'state', fixtureId: 'f1', state: { kind: 'postponed', at: LATE_THAT_NIGHT } },
        ])
    })

    it('keeps a postponement even when the feed later shows a new date', () => {
        const fixture = stored({ state: { kind: 'postponed', at: SOON_AFTER } })
        const rearranged = feed({ kickoffAt: new Date('2027-02-10T19:45:00Z') })
        expect(run({ fixture, primary: rearranged })).toEqual({ changes: [], alerts: [] })
    })

    it('never postpones a match that already has a result', () => {
        const fixture = stored({ state: { kind: 'finished', home: 2, away: 1 } })
        expect(run({ fixture, primary: feed({ status: 'postponed' }) })).toEqual({ changes: [], alerts: [] })
    })

    it('marks a match abandoned when the feed suspends it', () => {
        expect(run({ primary: feed({ status: 'abandoned' }) }).changes).toEqual([
            { kind: 'state', fixtureId: 'f1', state: { kind: 'abandoned' } },
        ])
    })
})

describe('syncFixtures: kick-off changes (Decision 12)', () => {
    it('moves the kick-off within the week, with no alert', () => {
        const later = new Date('2026-11-22T16:30:00Z')
        expect(run({ primary: feed({ kickoffAt: later }) })).toEqual({
            changes: [{ kind: 'kickoff', fixtureId: 'f1', kickoffAt: later }],
            alerts: [],
        })
    })

    it('alerts the admin when a match moves before the fixed cut-off', () => {
        const earlier = new Date('2026-11-21T10:00:00Z')
        expect(run({ primary: feed({ kickoffAt: earlier }) }).alerts).toEqual([
            { kind: 'kickoffBeforeCutoff', fixtureId: 'f1', kickoffAt: earlier, cutoffAt: CUTOFF },
        ])
    })

    it('ignores differences under a minute', () => {
        const almost = new Date(KICKOFF.getTime() + 30 * 1000)
        expect(run({ primary: feed({ kickoffAt: almost }) })).toEqual({ changes: [], alerts: [] })
    })
})

describe('syncFixtures: admin and missing data (Decision 7b)', () => {
    it('never touches a fixture the admin has overridden', () => {
        const fixture = stored({ override: { kind: 'void' } })
        expect(run({ fixture, primary: finished21, secondary: fplFinished(2, 1) })).toEqual({ changes: [], alerts: [] })
    })

    it('alerts when a fixture is missing from the feed', () => {
        expect(run({ primary: null })).toEqual({ changes: [], alerts: [{ kind: 'missingFromFeed', fixtureId: 'f1' }] })
    })
})
