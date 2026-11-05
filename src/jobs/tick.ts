// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Runs one tick for every active competition (PLAN.md section 6):
//   1. sync the feeds and save fixture changes and alerts
//   2. open the next week, lock and auto-assign, mark weeks settled,
//      and move the competition status on (planTick)
//
// Each competition is handled in one transaction holding a Postgres
// advisory lock, so two ticks at once (the scheduler and a page request)
// can never assign picks twice. Every step can be repeated safely.

import { and, eq, inArray, sql } from 'drizzle-orm'

import type { Database } from '@/db/client'
import { fromFixtureState, toGameState } from '@/db/game-state'
import { activeCompetitionIds, loadCompetitionRows } from '@/db/load'
import type { Executor } from '@/db/load'
import { alerts, competitions, fixtures, picks, weeks } from '@/db/schema'
import type { FixtureChange } from '@/feeds/sync'
import { syncFixtures } from '@/feeds/sync'
import { competitionNow } from '@/demo/clock'
import type { FeedMatch } from '@/feeds/types'

import { expireHolds } from '@/payments/service'

import { syncAlertRow, tickAlertRow } from './alert-messages'
import type { AlertNames, AlertRow } from './alert-messages'
import { planTick } from './plan-tick'
import type { CompetitionStatus } from './plan-tick'

/** Where the tick gets the feeds. `null` skips the sync (used on page requests). */
export interface FeedSource {
    primary(season: number): Promise<readonly FeedMatch[]>
    secondary(teamNames: readonly string[]): Promise<readonly FeedMatch[]>
}

export interface TickReport {
    readonly competitionId: string
    readonly feed: 'synced' | 'skipped' | { readonly error: string }
    readonly fixtureChanges: number
    readonly openedWeeks: readonly number[]
    readonly autoPicks: number
    readonly settledWeeks: readonly number[]
    readonly status: CompetitionStatus
    readonly newAlerts: number
}

export async function runTick(db: Database, now: Date, feeds: FeedSource | null): Promise<readonly TickReport[]> {
    const reports: TickReport[] = []
    for (const competitionId of await activeCompetitionIds(db)) {
        reports.push(await tickCompetition(db, competitionId, now, feeds))
    }

    return reports
}

/** The lock-and-assign part only. Cheap enough to run on page requests. */
export async function ensureLocked(db: Database, competitionId: string, now: Date): Promise<TickReport> {
    return tickCompetition(db, competitionId, now, null)
}

async function tickCompetition(
    db: Database,
    competitionId: string,
    now: Date,
    feeds: FeedSource | null,
): Promise<TickReport> {
    const fetched = await fetchFeeds(db, competitionId, feeds)

    return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${competitionId}))`)
        await expireHolds(tx, now, competitionId)

        let rows = await loadCompetitionRows(tx, competitionId)
        // A demo runs on its own clock (src/demo/clock.ts).
        const clock = competitionNow(rows.competition, now)
        const names = alertNamesOf(rows)
        let fixtureChanges = 0
        let newAlerts = 0

        if (fetched.kind === 'fetched') {
            const teamNames = new Map(rows.teams.map((team) => {
                return [team.id, team.fullName] as const
            }))
            const state = toGameState(rows)
            const externalIds = new Map(rows.fixtures.map((row) => {
                return [row.id, row.externalId] as const
            }))
            const result = syncFixtures({
                fixtures: state.fixtures.map((fixture) => {
                    return { ...fixture, externalId: externalIds.get(fixture.id) ?? 0 }
                }),
                weeks: state.weeks,
                teamNames,
                primary: fetched.primary,
                secondary: fetched.secondary,
                now: clock,
            })

            await applyFixtureChanges(tx, result.changes, clock)
            newAlerts += await insertAlerts(tx, competitionId, result.alerts.map((alert) => {
                return syncAlertRow(alert, names)
            }))
            fixtureChanges = result.changes.length

            if (fixtureChanges > 0) {
                rows = await loadCompetitionRows(tx, competitionId)
            }
        }

        const plan = planTick({
            state: toGameState(rows),
            weeks: rows.weeks,
            status: rows.competition.status,
            now: clock,
        })

        const weekIdByNumber = new Map(rows.weeks.map((week) => {
            return [week.number, week.id] as const
        }))
        const weekIdOf = (number: number): string => {
            const id = weekIdByNumber.get(number)
            if (id === undefined) {
                throw new Error(`No week ${number} in competition ${competitionId}`)
            }

            return id
        }

        for (const opening of plan.openings) {
            await tx.update(weeks)
                .set({ cutoffAt: opening.cutoffAt, openedAt: clock })
                .where(and(eq(weeks.id, weekIdOf(opening.weekNumber)), sql`${weeks.openedAt} is null`))
        }

        if (plan.picks.length > 0) {
            await tx.insert(picks)
                .values(plan.picks.map((pick) => {
                    return {
                        entryId: pick.entryId,
                        weekId: weekIdOf(pick.week),
                        teamId: pick.teamId,
                        source: pick.source,
                        updatedAt: clock,
                    }
                }))
                .onConflictDoUpdate({
                    target: [picks.entryId, picks.weekId],
                    set: { teamId: sql`excluded.team_id`, source: sql`excluded.source`, updatedAt: clock },
                })
        }

        if (plan.settledWeeks.length > 0) {
            await tx.update(weeks)
                .set({ settledAt: clock })
                .where(and(inArray(weeks.id, plan.settledWeeks.map(weekIdOf)), sql`${weeks.settledAt} is null`))
        }

        if (plan.status !== rows.competition.status) {
            await tx.update(competitions).set({ status: plan.status }).where(eq(competitions.id, competitionId))
        }

        newAlerts += await insertAlerts(tx, competitionId, plan.alerts.map((alert) => {
            return tickAlertRow(alert, names)
        }))

        return {
            competitionId,
            feed: fetched.kind === 'fetched' ? 'synced' : fetched.kind === 'skipped' ? 'skipped' : { error: fetched.error },
            fixtureChanges,
            openedWeeks: plan.openings.map((opening) => {
                return opening.weekNumber
            }),
            autoPicks: plan.picks.length,
            settledWeeks: plan.settledWeeks,
            status: plan.status,
            newAlerts,
        }
    })
}

type Fetched =
    | { readonly kind: 'fetched'; readonly primary: readonly FeedMatch[]; readonly secondary: readonly FeedMatch[] }
    | { readonly kind: 'skipped' }
    | { readonly kind: 'failed'; readonly error: string }

/** Network calls happen outside the transaction. A feed failure never blocks locking. */
async function fetchFeeds(db: Database, competitionId: string, feeds: FeedSource | null): Promise<Fetched> {
    if (feeds === null) {
        return { kind: 'skipped' }
    }

    try {
        const rows = await loadCompetitionRows(db, competitionId)
        if (rows.competition.isDemo) {
            return { kind: 'skipped' }
        }

        const teamNames = rows.teams.map((team) => {
            return team.fullName
        })
        const [primary, secondary] = await Promise.all([
            feeds.primary(rows.competition.season),
            feeds.secondary(teamNames),
        ])

        return { kind: 'fetched', primary, secondary }
    } catch (error) {
        return { kind: 'failed', error: error instanceof Error ? error.message : String(error) }
    }
}

async function applyFixtureChanges(tx: Executor, changes: readonly FixtureChange[], now: Date) {
    for (const change of changes) {
        const columns = change.kind === 'kickoff'
            ? { kickoffAt: change.kickoffAt }
            : fromFixtureState(change.state)

        await tx.update(fixtures)
            .set({ ...columns, updatedAt: now })
            .where(and(eq(fixtures.id, change.fixtureId), sql`${fixtures.overrideKind} is null`))
    }
}

/** Inserts alerts that are not already open. Returns how many are new. */
async function insertAlerts(tx: Executor, competitionId: string, rows: readonly AlertRow[]): Promise<number> {
    if (rows.length === 0) {
        return 0
    }

    const inserted = await tx.insert(alerts)
        .values(rows.map((row) => {
            return { competitionId, kind: row.kind, key: row.key, fixtureId: row.fixtureId, message: row.message }
        }))
        .onConflictDoNothing()
        .returning({ id: alerts.id })

    return inserted.length
}

function alertNamesOf(rows: Awaited<ReturnType<typeof loadCompetitionRows>>): AlertNames {
    const teamName = new Map(rows.teams.map((team) => {
        return [team.id, team.fullName] as const
    }))
    const fixtureLabels = new Map(rows.fixtures.map((fixture) => {
        const home = teamName.get(fixture.homeTeamId) ?? 'Unknown'
        const away = teamName.get(fixture.awayTeamId) ?? 'Unknown'
        return [fixture.id, `${home} v ${away}`] as const
    }))
    const entryNames = new Map(rows.entries.map((entry) => {
        return [entry.id, entry.displayName] as const
    }))

    return {
        fixtureLabel: (fixtureId) => {
            return fixtureLabels.get(fixtureId) ?? 'A fixture'
        },
        entryName: (entryId) => {
            return entryNames.get(entryId) ?? 'A player'
        },
    }
}
