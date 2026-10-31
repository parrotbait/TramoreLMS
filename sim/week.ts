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

export interface WeekTimes {
    readonly cutoffAt: Date
    readonly pickAt: Date
    readonly earlyAt: Date
    readonly repickAt: Date
    readonly lateAt: Date
    readonly afterAt: Date
}

/**
 * One week, run step by step. The CLI and the scenarios run every step at
 * once (playWeek). The browser preview stops between steps.
 */
export class WeekTimeline {
    readonly times: WeekTimes
    private readonly competition: SimCompetition
    private readonly driver: WeekDriver
    private readonly fixtures: readonly Fixture[]
    private readonly rejections: PickRejectionLog[] = []
    private readonly autoPicks: Pick[] = []
    private readonly buybackRejections: EntryId[]

    /** Adds and opens the week, then applies withdrawals and buy-backs. */
    constructor(competition: SimCompetition, driver: WeekDriver, previousAfterAt: Date | null) {
        this.competition = competition
        this.driver = driver

        const weekNumber = driver.weekNumber
        this.fixtures = competition.addWeek(weekNumber, driver.fixtures)
        const kickoffs = this.fixtures.map((fixture) => {
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
        this.times = {
            cutoffAt,
            pickAt: new Date(pickMs),
            earlyAt: new Date(pickMs + (cutoffMs - pickMs) / 2),
            repickAt: new Date(cutoffMs - MINUTE_MS),
            lateAt: new Date(cutoffMs + 30 * MINUTE_MS),
            afterAt: new Date(Math.max(...kickoffs) + 7 * HOUR_MS),
        }

        for (const entryId of driver.withdrawals ?? []) {
            competition.withdraw(entryId, weekNumber)
        }

        this.buybackRejections = (driver.buybacks ?? []).filter((entryId) => {
            return competition.buyBack(entryId, this.times.pickAt) === 'buybackUnavailable'
        })
    }

    get weekNumber(): number {
        return this.driver.weekNumber
    }

    async collectPicks() {
        this.submit(await this.driver.picks(this.competition, this.times.pickAt), this.times.pickAt)
    }

    postponeEarly() {
        for (const fixtureId of this.driver.earlyPostponements?.(this.fixtures) ?? []) {
            this.competition.postpone(fixtureId, this.times.earlyAt)
        }
    }

    async collectRepicks() {
        if (this.driver.repicks === undefined) {
            return
        }

        this.submit(await this.driver.repicks(this.competition, this.times.repickAt), this.times.repickAt)
    }

    lock() {
        this.autoPicks.push(...this.competition.lock(this.weekNumber, this.times.cutoffAt))
    }

    /** Results, overrides, then auto-assign again for players who became eligible late. */
    async playResults() {
        const { lateAt, afterAt } = this.times
        const results = await this.driver.results(this.competition, this.competition.fixturesOf(this.weekNumber))
        for (const [fixtureId, result] of results) {
            applyResult(this.competition, fixtureId, result, lateAt, afterAt)
        }

        for (const [fixtureId, override] of this.driver.fixtureOverrides?.(this.fixtures) ?? new Map()) {
            this.competition.overrideFixture(fixtureId, override)
        }

        for (const [entryId, outcome] of this.driver.pickOverrides ?? []) {
            this.competition.overridePick(entryId, this.weekNumber, outcome)
        }

        await this.driver.afterResults?.(this.competition, afterAt)
        this.autoPicks.push(...this.competition.lock(this.weekNumber, afterAt))
    }

    log(): WeekLog {
        return {
            weekNumber: this.weekNumber,
            cutoffAt: this.times.cutoffAt,
            afterAt: this.times.afterAt,
            rejections: this.rejections,
            buybackRejections: this.buybackRejections,
            autoPicks: this.autoPicks,
        }
    }

    private submit(requests: readonly PickRequest[], now: Date) {
        for (const request of requests) {
            const validation = this.competition.pick(request.entryId, this.weekNumber, request.teamId, now)
            if (!validation.ok) {
                this.rejections.push({ ...request, reason: validation.reason })
            }
        }
    }
}

export async function playWeek(
    competition: SimCompetition,
    driver: WeekDriver,
    previousAfterAt: Date | null,
): Promise<WeekLog> {
    const timeline = new WeekTimeline(competition, driver, previousAfterAt)
    await timeline.collectPicks()
    timeline.postponeEarly()
    await timeline.collectRepicks()
    timeline.lock()
    await timeline.playResults()

    return timeline.log()
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
