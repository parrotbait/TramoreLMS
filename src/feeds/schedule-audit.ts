// Created by Claude driven by Eddie Long on 2026-11-25.
//
// A periodic check that our fixture list still matches the season. Pure.
//
// The tick keeps the games we have up to date: times, postponements, results.
// It never adds or removes a game. This check looks for what that misses:
//   - a game in the feed that we do not have, and
//   - a team that has no game, or two games, in a week that is still to play.
// Every team must play once in every week. The rules depend on it.
//
// Each problem has a fixed key, so the same problem is raised once.

import { slug } from '@/lib/slug'

import type { FeedMatch } from './types'

/** Ticks run every 10 minutes, so a 10-minute window catches one tick in every 6 hours. */
const CHECK_EVERY_HOURS = 6
const TICK_MINUTES = 10

/** Is this the tick that runs the check? Stateless: no record of the last run is needed. */
export function isScheduleCheckDue(now: Date): boolean {
    return now.getUTCHours() % CHECK_EVERY_HOURS === 0 && now.getUTCMinutes() < TICK_MINUTES
}

export interface AuditFixture {
    readonly externalId: number
    readonly weekNumber: number
    readonly homeTeamId: string
    readonly awayTeamId: string
}

export interface AuditWeek {
    readonly number: number
    readonly plMatchday: number
    readonly isSettled: boolean
}

export interface AuditInput {
    readonly fixtures: readonly AuditFixture[]
    readonly weeks: readonly AuditWeek[]
    readonly teams: readonly { readonly id: string; readonly fullName: string }[]
    /** The main feed’s whole season. */
    readonly feed: readonly FeedMatch[]
}

export interface ScheduleAlert {
    readonly kind: 'scheduleGameAdded' | 'scheduleTeamMissing' | 'scheduleTeamTwice'
    readonly key: string
    readonly message: string
}

export function auditSchedule(input: AuditInput): readonly ScheduleAlert[] {
    const alerts: ScheduleAlert[] = []
    const weekByMatchday = new Map(input.weeks.map((week) => {
        return [week.plMatchday, week] as const
    }))
    const known = new Set(input.fixtures.map((fixture) => {
        return fixture.externalId
    }))

    for (const match of input.feed) {
        const week = match.matchday === null ? undefined : weekByMatchday.get(match.matchday)
        if (week === undefined || week.isSettled || known.has(match.externalId)) {
            continue
        }

        alerts.push({
            kind: 'scheduleGameAdded',
            key: `scheduleGameAdded:${match.externalId}`,
            message: `The feed has a game we don’t have: ${match.home.name} v ${match.away.name}, `
                + `PL Matchday ${week.plMatchday} (Week ${week.number}). Check the week’s fixtures.`,
        })
    }

    for (const week of input.weeks) {
        if (week.isSettled) {
            continue
        }

        const counts = new Map<string, number>()
        for (const fixture of input.fixtures) {
            if (fixture.weekNumber !== week.number) {
                continue
            }

            for (const teamId of [fixture.homeTeamId, fixture.awayTeamId]) {
                counts.set(teamId, (counts.get(teamId) ?? 0) + 1)
            }
        }

        for (const team of input.teams) {
            const games = counts.get(team.id) ?? 0
            if (games === 1) {
                continue
            }

            const where = `Week ${week.number} (PL Matchday ${week.plMatchday})`
            alerts.push(games === 0
                ? {
                    kind: 'scheduleTeamMissing',
                    key: `scheduleTeamMissing:${week.number}:${slug(team.fullName)}`,
                    message: `${team.fullName} has no game in ${where}. They can’t be picked that week. Check the fixtures.`,
                }
                : {
                    kind: 'scheduleTeamTwice',
                    key: `scheduleTeamTwice:${week.number}:${slug(team.fullName)}`,
                    message: `${team.fullName} has ${games} games in ${where}. Check the fixtures.`,
                })
        }
    }

    return alerts
}
