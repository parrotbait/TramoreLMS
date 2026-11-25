// Created by Claude driven by Eddie Long on 2026-11-25.

import { describe, expect, it } from 'vitest'

import { auditSchedule, isScheduleCheckDue } from '../schedule-audit'
import type { AuditFixture, AuditWeek } from '../schedule-audit'
import type { FeedMatch } from '../types'

const teams = [
    { id: 'ars', fullName: 'Arsenal' },
    { id: 'che', fullName: 'Chelsea' },
    { id: 'eve', fullName: 'Everton' },
    { id: 'ful', fullName: 'Fulham' },
]

const weeks: AuditWeek[] = [
    { number: 1, plMatchday: 11, isSettled: false },
    { number: 2, plMatchday: 12, isSettled: false },
]

const fixtures: AuditFixture[] = [
    { externalId: 1, weekNumber: 1, homeTeamId: 'ars', awayTeamId: 'che' },
    { externalId: 2, weekNumber: 1, homeTeamId: 'eve', awayTeamId: 'ful' },
    { externalId: 3, weekNumber: 2, homeTeamId: 'ars', awayTeamId: 'eve' },
    { externalId: 4, weekNumber: 2, homeTeamId: 'che', awayTeamId: 'ful' },
]

function feedMatch(externalId: number, matchday: number, home: string, away: string): FeedMatch {
    return {
        externalId,
        matchday,
        kickoffAt: new Date('2026-11-21T15:00:00Z'),
        status: 'scheduled',
        home: { name: home, crestUrl: null },
        away: { name: away, crestUrl: null },
        score: null,
    }
}

const feed = [
    feedMatch(1, 11, 'Arsenal', 'Chelsea'),
    feedMatch(2, 11, 'Everton', 'Fulham'),
    feedMatch(3, 12, 'Arsenal', 'Everton'),
    feedMatch(4, 12, 'Chelsea', 'Fulham'),
]

describe('isScheduleCheckDue', () => {
    it('is due for exactly one 10-minute tick in every 6 hours', () => {
        const ticks = Array.from({ length: 24 * 6 }, (_, index) => {
            return new Date(Date.UTC(2026, 10, 25, 0, index * 10))
        })

        expect(ticks.filter(isScheduleCheckDue).map((tick) => {
            return tick.toISOString().slice(11, 16)
        })).toEqual(['00:00', '06:00', '12:00', '18:00'])
    })
})

describe('auditSchedule', () => {
    it('raises nothing when the list is complete and matches the feed', () => {
        expect(auditSchedule({ fixtures, weeks, teams, feed })).toEqual([])
    })

    it('raises a game the feed has that we do not', () => {
        const added = [...feed, feedMatch(9, 12, 'Arsenal', 'Fulham')]

        const alerts = auditSchedule({ fixtures, weeks, teams, feed: added })

        expect(alerts).toHaveLength(1)
        expect(alerts[0]).toMatchObject({ kind: 'scheduleGameAdded', key: 'scheduleGameAdded:9' })
        expect(alerts[0]?.message).toContain('Arsenal v Fulham')
        expect(alerts[0]?.message).toContain('Week 2')
    })

    it('ignores feed games in other matchdays and in weeks that are settled', () => {
        const other = [...feed, feedMatch(8, 30, 'Arsenal', 'Fulham'), feedMatch(9, 11, 'Arsenal', 'Fulham')]
        const settled = [{ number: 1, plMatchday: 11, isSettled: true }, ...weeks.slice(1)]

        expect(auditSchedule({ fixtures, weeks: settled, teams, feed: other })).toEqual([])
    })

    it('raises a team with no game in a week still to play', () => {
        const without = fixtures.filter((fixture) => {
            return fixture.externalId !== 4
        })

        const alerts = auditSchedule({ fixtures: without, weeks, teams, feed })

        // The feed still has the game, so it is also raised as a game we don’t have.
        expect(alerts.map((alert) => {
            return alert.key
        })).toEqual(['scheduleGameAdded:4', 'scheduleTeamMissing:2:chelsea', 'scheduleTeamMissing:2:fulham'])
        expect(alerts[1]?.message).toBe('Chelsea has no game in Week 2 (PL Matchday 12). They can’t be picked that week. Check the fixtures.')
    })

    it('raises a team with two games', () => {
        const twice = [...fixtures, { externalId: 5, weekNumber: 1, homeTeamId: 'ars', awayTeamId: 'ful' }]

        const alerts = auditSchedule({ fixtures: twice, weeks, teams, feed })

        expect(alerts.map((alert) => {
            return alert.key
        })).toEqual(['scheduleTeamTwice:1:arsenal', 'scheduleTeamTwice:1:fulham'])
    })

    it('does not look at weeks that are settled', () => {
        const without = fixtures.filter((fixture) => {
            return fixture.externalId !== 2
        })
        const settled = [{ number: 1, plMatchday: 11, isSettled: true }, ...weeks.slice(1)]

        expect(auditSchedule({ fixtures: without, weeks: settled, teams, feed })).toEqual([])
    })
})
