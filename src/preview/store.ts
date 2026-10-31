// Created by Claude driven by Eddie Long on 2026-10-31.
//
// The browser preview's simulated competition, held in server memory.
// There is no database. Restarting the dev server starts a fresh season.
//
// The week moves through three phases, driven by the toolbar:
//   picking  → you pick. Other players have picked at random.
//   locked   → cut-off passed, auto-assign ran, picks are revealed
//   settled  → results are in

import type { PickValidation } from '@/engine'
import { loadCrestIndex } from '@/lib/crests'
import type { ViewContext } from '@/view-models/context'

import { SimCompetition } from '../../sim/competition'
import { Random } from '../../sim/random'
import { randomDriver } from '../../sim/random-driver'
import { hasCachedSeason, loadCachedSeason } from '../../sim/real-season'
import { playerNames, syntheticSeason } from '../../sim/season'
import type { Season } from '../../sim/season'
import { WeekTimeline } from '../../sim/week'
import type { WeekDriver } from '../../sim/week'

export const YOU = 'you'

const PLAYERS = 40
const START_MATCHDAY = 11
const HOUR_MS = 60 * 60 * 1000

export type PreviewPhase =
    | 'picking'
    | 'finalHours'
    | 'locked'
    | 'settled'

interface PreviewSession {
    readonly seed: number
    readonly season: Season
    readonly random: Random
    readonly competition: SimCompetition
    timeline: WeekTimeline
    phase: PreviewPhase
    now: Date
}

const globalStore = globalThis as typeof globalThis & { lmsPreview?: Promise<PreviewSession> }

export function isPreviewEnabled(): boolean {
    return process.env.NODE_ENV !== 'production' || process.env['ENABLE_PREVIEW'] === 'true'
}

export async function getPreview(): Promise<PreviewSession> {
    globalStore.lmsPreview ??= createSession(Math.floor(Math.random() * 1_000_000))
    return globalStore.lmsPreview
}

export async function resetPreview(seed = Math.floor(Math.random() * 1_000_000)) {
    globalStore.lmsPreview = createSession(seed)
    await globalStore.lmsPreview
}

export function finalWeekOf(): number {
    return 38 - START_MATCHDAY + 1
}

export function viewContextOf(session: PreviewSession): ViewContext {
    const crests = loadCrestIndex()

    return {
        state: session.competition.state,
        standings: session.competition.standings(session.now),
        now: session.now,
        nameOf: (entryId) => {
            return entryId === YOU ? 'You' : entryId
        },
        plMatchdayOf: (weekNumber) => {
            return START_MATCHDAY + weekNumber - 1
        },
        crestOf: (teamId) => {
            return crests.get(teamId) ?? null
        },
    }
}

export function pickForYou(session: PreviewSession, teamId: string): PickValidation {
    return session.competition.pick(YOU, session.timeline.weekNumber, teamId, session.now)
}

export function buyBackForYou(session: PreviewSession) {
    session.competition.buyBack(YOU, session.now)
}

/** Postpones your pick's match, or the first match not yet played. Only before the cut-off. */
export function postponeAMatch(session: PreviewSession) {
    if (session.phase !== 'picking' && session.phase !== 'finalHours') {
        return
    }

    const weekNumber = session.timeline.weekNumber
    const yourTeam = session.competition.pickOf(YOU, weekNumber)?.teamId
    const scheduled = session.competition.fixturesOf(weekNumber).filter((fixture) => {
        return fixture.state.kind === 'scheduled'
    })
    const target = scheduled.find((fixture) => {
        return fixture.homeTeamId === yourTeam || fixture.awayTeamId === yourTeam
    }) ?? scheduled[0]

    if (target !== undefined) {
        session.competition.postpone(target.id, session.now)
    }
}

/** Moves the simulated clock to the next step. */
export async function advancePreview(session: PreviewSession) {
    const { timeline } = session

    switch (session.phase) {
        case 'picking':
            session.now = new Date(timeline.times.cutoffAt.getTime() - 3 * HOUR_MS)
            session.phase = 'finalHours'
            return
        case 'finalHours':
            await timeline.collectRepicks()
            timeline.lock()
            session.now = new Date(timeline.times.cutoffAt.getTime() + 60 * 1000)
            session.phase = 'locked'
            return
        case 'locked':
            await timeline.playResults()
            session.now = timeline.times.afterAt
            session.phase = 'settled'
            return
        case 'settled':
            break
    }

    const isRunning = session.competition.standings(session.now).outcome.kind === 'running'
    const nextWeek = timeline.weekNumber + 1
    if (!isRunning || nextWeek > finalWeekOf()) {
        return
    }

    await startWeek(session, nextWeek, timeline.times.afterAt)
}

/** Plays every remaining step until the competition ends. */
export async function playToEnd(session: PreviewSession) {
    for (let step = 0; step < 4 * finalWeekOf(); step += 1) {
        const before = `${session.timeline.weekNumber}:${session.phase}`
        await advancePreview(session)
        if (`${session.timeline.weekNumber}:${session.phase}` === before) {
            return
        }
    }
}

async function createSession(seed: number): Promise<PreviewSession> {
    const season = hasCachedSeason() ? loadCachedSeason() : syntheticSeason(START_MATCHDAY)
    const random = new Random(seed)
    const competition = new SimCompetition(season.teams, [YOU, ...playerNames(PLAYERS - 1, random)], finalWeekOf())
    const firstWeek = await openWeek(competition, season, random, 1, null)

    return { seed, season, random, competition, ...firstWeek }
}

async function startWeek(session: PreviewSession, weekNumber: number, previousAfterAt: Date | null) {
    const week = await openWeek(session.competition, session.season, session.random, weekNumber, previousAfterAt)
    session.timeline = week.timeline
    session.phase = week.phase
    session.now = week.now
}

async function openWeek(
    competition: SimCompetition,
    season: Season,
    random: Random,
    weekNumber: number,
    previousAfterAt: Date | null,
): Promise<{ timeline: WeekTimeline; phase: PreviewPhase; now: Date }> {
    const fixtures = season.matchdays[START_MATCHDAY + weekNumber - 2]?.fixtures ?? []
    const driver = othersOnly(randomDriver(weekNumber, fixtures, random))
    const timeline = new WeekTimeline(competition, driver, previousAfterAt)
    await timeline.collectPicks()

    return { timeline, phase: 'picking', now: timeline.times.pickAt }
}

/** The random players pick for everyone except you. Postponements come from the toolbar only. */
function othersOnly(driver: WeekDriver): WeekDriver {
    return {
        ...driver,
        picks: async (competition, now) => {
            return (await driver.picks(competition, now)).filter((request) => {
                return request.entryId !== YOU
            })
        },
        repicks: async (competition, now) => {
            return (await driver.repicks?.(competition, now) ?? []).filter((request) => {
                return request.entryId !== YOU
            })
        },
        earlyPostponements: () => {
            return []
        },
    }
}
