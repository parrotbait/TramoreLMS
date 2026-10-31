// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Turns the two feeds into changes to our fixtures. Pure: the tick job
// (build step 6) loads the fixtures, calls this, then saves the changes
// and raises the alerts.
//
// Rules:
//   - An admin override is never touched by the feed (Decision 7b).
//   - A postponement is sticky. A rearranged date later in the season does
//     not bring the fixture back into its old week (Decision 7).
//   - A match rearranged more than 7 days after the cut-off counts as
//     postponed, even if the feed has no POSTPONED status for it.
//   - Kick-off changes are applied, with an alert if one moves before the
//     week's fixed cut-off (Decision 12).
//   - A result is applied only when both feeds agree (Decisions 3 and 20).

import { reconcile } from '@/engine'
import type { FeedScore, Fixture, FixtureState, HoldReason, TeamId, Week } from '@/engine'

import type { FeedMatch } from './types'

const MINUTE_MS = 60 * 1000
const RESCHEDULED_AFTER_MS = 7 * 24 * 60 * MINUTE_MS

export interface StoredFixture extends Fixture {
    /** The football-data.org match id. */
    readonly externalId: number
}

export type FixtureChange =
    | { readonly kind: 'kickoff'; readonly fixtureId: string; readonly kickoffAt: Date }
    | { readonly kind: 'state'; readonly fixtureId: string; readonly state: FixtureState }

export type SyncAlert =
    | { readonly kind: 'kickoffBeforeCutoff'; readonly fixtureId: string; readonly kickoffAt: Date; readonly cutoffAt: Date }
    | { readonly kind: 'resultHeld'; readonly fixtureId: string; readonly reason: HoldReason }
    | { readonly kind: 'resultChanged'; readonly fixtureId: string; readonly from: FeedScore; readonly to: FeedScore }
    | { readonly kind: 'missingFromFeed'; readonly fixtureId: string }

export interface SyncInput {
    readonly fixtures: readonly StoredFixture[]
    readonly weeks: readonly Week[]
    readonly teamNames: ReadonlyMap<TeamId, string>
    readonly primary: readonly FeedMatch[]
    readonly secondary: readonly FeedMatch[]
    readonly now: Date
}

export interface SyncResult {
    readonly changes: readonly FixtureChange[]
    readonly alerts: readonly SyncAlert[]
}

export function syncFixtures(input: SyncInput): SyncResult {
    const primaryById = new Map(input.primary.map((match) => {
        return [match.externalId, match] as const
    }))
    const secondaryByTeams = new Map(input.secondary.map((match) => {
        return [teamsKey(match.home.name, match.away.name), match] as const
    }))
    const cutoffByWeek = new Map(input.weeks.map((week) => {
        return [week.number, week.cutoffAt] as const
    }))

    const changes: FixtureChange[] = []
    const alerts: SyncAlert[] = []

    for (const fixture of input.fixtures) {
        const feed = primaryById.get(fixture.externalId)
        if (feed === undefined) {
            alerts.push({ kind: 'missingFromFeed', fixtureId: fixture.id })
            continue
        }

        const isSettledByAdmin = fixture.override !== undefined
        const isPostponed = fixture.state.kind === 'postponed'
        if (isSettledByAdmin || isPostponed) {
            continue
        }

        const cutoffAt = cutoffByWeek.get(fixture.week) ?? null
        const secondary = secondaryByTeams.get(teamsKey(
            input.teamNames.get(fixture.homeTeamId) ?? fixture.homeTeamId,
            input.teamNames.get(fixture.awayTeamId) ?? fixture.awayTeamId,
        ))

        const result = syncOne(fixture, feed, secondary, cutoffAt, input.now)
        changes.push(...result.changes)
        alerts.push(...result.alerts)
    }

    return { changes, alerts }
}

function syncOne(
    fixture: StoredFixture,
    feed: FeedMatch,
    secondary: FeedMatch | undefined,
    cutoffAt: Date | null,
    now: Date,
): SyncResult {
    const postponed: FixtureChange = { kind: 'state', fixtureId: fixture.id, state: { kind: 'postponed', at: now } }
    const canBePostponed = fixture.state.kind !== 'finished'

    if (canBePostponed && (feed.status === 'postponed' || feed.status === 'cancelled')) {
        return { changes: [postponed], alerts: [] }
    }

    const isRescheduledOutOfWeek = canBePostponed
        && cutoffAt !== null
        && feed.kickoffAt.getTime() - cutoffAt.getTime() > RESCHEDULED_AFTER_MS
    if (isRescheduledOutOfWeek) {
        return { changes: [postponed], alerts: [] }
    }

    const changes: FixtureChange[] = []
    const alerts: SyncAlert[] = []

    const hasKickoffMoved = Math.abs(feed.kickoffAt.getTime() - fixture.kickoffAt.getTime()) >= MINUTE_MS
    if (hasKickoffMoved && fixture.state.kind === 'scheduled') {
        changes.push({ kind: 'kickoff', fixtureId: fixture.id, kickoffAt: feed.kickoffAt })
        if (cutoffAt !== null && feed.kickoffAt.getTime() < cutoffAt.getTime()) {
            alerts.push({ kind: 'kickoffBeforeCutoff', fixtureId: fixture.id, kickoffAt: feed.kickoffAt, cutoffAt })
        }
    }

    if (feed.status === 'abandoned' && fixture.state.kind === 'scheduled') {
        changes.push({ kind: 'state', fixtureId: fixture.id, state: { kind: 'abandoned' } })
        return { changes, alerts }
    }

    if (feed.status !== 'finished' || feed.score === null) {
        return { changes, alerts }
    }

    const reconciliation = reconcile(
        { finished: true, score: feed.score },
        secondary === undefined ? undefined : { finished: secondary.status === 'finished', score: secondary.score },
        fixture.kickoffAt,
        now,
    )

    switch (reconciliation.kind) {
        case 'wait':
            return { changes, alerts }
        case 'hold':
            alerts.push({ kind: 'resultHeld', fixtureId: fixture.id, reason: reconciliation.reason })
            return { changes, alerts }
        case 'accept':
            break
    }

    const score = reconciliation.score
    if (fixture.state.kind === 'finished') {
        const previous = { home: fixture.state.home, away: fixture.state.away }
        const isSame = previous.home === score.home && previous.away === score.away
        if (isSame) {
            return { changes, alerts }
        }

        alerts.push({ kind: 'resultChanged', fixtureId: fixture.id, from: previous, to: score })
    }

    changes.push({ kind: 'state', fixtureId: fixture.id, state: { kind: 'finished', home: score.home, away: score.away } })
    return { changes, alerts }
}

function teamsKey(home: string, away: string): string {
    return `${home}|${away}`
}
