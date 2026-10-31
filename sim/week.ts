// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Plays one competition week on a realistic timeline:
//
//   open        6 days before the first kick-off. The cut-off is fixed here.
//   pick        2 days before the cut-off (or just after last week's results)
//   postponed   half-way between pick and cut-off: early postponements land
//   repick      1 minute before the cut-off
//   cut-off     auto-assign runs
//   late        30 minutes after the cut-off: late postponements land
//   after       7 hours after the last kick-off: results come in, overrides
//               are applied, and auto-assign runs again for late eligibility

import type {
    EntryId,
    FeedScore,
    Fixture,
    FixtureOverride,
    Pick,
    PickRejection,
    TeamId,
    Verdict,
} from '@/engine'

import type { FixtureSeed, SimCompetition } from './competition'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

type MaybePromise<T> = T | Promise<T>

export type PlannedResult =
    /** `secondary: null` means the cross-check feed never reports. */
    | { readonly kind: 'score'; readonly primary: FeedScore; readonly secondary: FeedScore | null }
    | { readonly kind: 'postponedLate' }
    | { readonly kind: 'abandoned' }
    | { readonly kind: 'unplayed' }

export interface PickRequest {
    readonly entryId: EntryId
    readonly teamId: TeamId
}

export interface WeekDriver {
    readonly weekNumber: number
    readonly fixtures: readonly FixtureSeed[]
    readonly withdrawals?: readonly EntryId[]
    readonly buybacks?: readonly EntryId[]
    readonly pickOverrides?: readonly (readonly [EntryId, Verdict])[]
    picks(competition: SimCompetition, now: Date): MaybePromise<readonly PickRequest[]>
    earlyPostponements?(fixtures: readonly Fixture[]): readonly string[]
    repicks?(competition: SimCompetition, now: Date): MaybePromise<readonly PickRequest[]>
    results(competition: SimCompetition, fixtures: readonly Fixture[]): MaybePromise<ReadonlyMap<string, PlannedResult>>
    fixtureOverrides?(fixtures: readonly Fixture[]): ReadonlyMap<string, FixtureOverride>
    afterResults?(competition: SimCompetition, now: Date): MaybePromise<void>
}

export interface PickRejectionLog {
    readonly entryId: EntryId
    readonly teamId: TeamId
    readonly reason: PickRejection
}

export interface WeekLog {
    readonly weekNumber: number
    readonly cutoffAt: Date
    readonly afterAt: Date
    readonly rejections: readonly PickRejectionLog[]
    readonly buybackRejections: readonly EntryId[]
    readonly autoPicks: readonly Pick[]
}

export async function playWeek(
    competition: SimCompetition,
    driver: WeekDriver,
    previousAfterAt: Date | null,
): Promise<WeekLog> {
    const weekNumber = driver.weekNumber
    const fixtures = competition.addWeek(weekNumber, driver.fixtures)
    const kickoffs = fixtures.map((fixture) => {
        return fixture.kickoffAt.getTime()
    })
    if (kickoffs.length === 0) {
        throw new Error(`Week ${weekNumber} has no fixtures`)
    }

    const cutoffAt = competition.openWeek(weekNumber, new Date(Math.min(...kickoffs) - 6 * DAY_MS))
    if (cutoffAt === null) {
        throw new Error(`Week ${weekNumber} has no cut-off`)
    }

    const cutoffMs = cutoffAt.getTime()
    const pickMs = Math.max((previousAfterAt?.getTime() ?? 0) + MINUTE_MS, cutoffMs - 2 * DAY_MS)
    const earlyAt = new Date(pickMs + (cutoffMs - pickMs) / 2)
    const repickAt = new Date(cutoffMs - MINUTE_MS)
    const lateAt = new Date(cutoffMs + 30 * MINUTE_MS)
    const afterAt = new Date(Math.max(...kickoffs) + 7 * HOUR_MS)
    const pickAt = new Date(pickMs)

    for (const entryId of driver.withdrawals ?? []) {
        competition.withdraw(entryId, weekNumber)
    }

    const buybackRejections = (driver.buybacks ?? []).filter((entryId) => {
        return competition.buyBack(entryId, pickAt) === 'buybackUnavailable'
    })

    const rejections: PickRejectionLog[] = []
    const submit = (requests: readonly PickRequest[], now: Date) => {
        for (const request of requests) {
            const validation = competition.pick(request.entryId, weekNumber, request.teamId, now)
            if (!validation.ok) {
                rejections.push({ ...request, reason: validation.reason })
            }
        }
    }

    submit(await driver.picks(competition, pickAt), pickAt)

    for (const fixtureId of driver.earlyPostponements?.(fixtures) ?? []) {
        competition.postpone(fixtureId, earlyAt)
    }

    if (driver.repicks !== undefined) {
        submit(await driver.repicks(competition, repickAt), repickAt)
    }

    const autoPicks = [...competition.lock(weekNumber, cutoffAt)]

    const results = await driver.results(competition, competition.fixturesOf(weekNumber))
    for (const [fixtureId, result] of results) {
        applyResult(competition, fixtureId, result, lateAt, afterAt)
    }

    for (const [fixtureId, override] of driver.fixtureOverrides?.(fixtures) ?? new Map()) {
        competition.overrideFixture(fixtureId, override)
    }

    for (const [entryId, outcome] of driver.pickOverrides ?? []) {
        competition.overridePick(entryId, weekNumber, outcome)
    }

    await driver.afterResults?.(competition, afterAt)
    autoPicks.push(...competition.lock(weekNumber, afterAt))

    return { weekNumber, cutoffAt, afterAt, rejections, buybackRejections, autoPicks }
}

function applyResult(
    competition: SimCompetition,
    fixtureId: string,
    result: PlannedResult,
    lateAt: Date,
    afterAt: Date,
) {
    switch (result.kind) {
        case 'unplayed':
            return
        case 'postponedLate':
            competition.postpone(fixtureId, lateAt)
            return
        case 'abandoned':
            competition.abandon(fixtureId)
            return
        case 'score':
            competition.report(fixtureId, result.primary, result.secondary, afterAt)
            return
    }
}
