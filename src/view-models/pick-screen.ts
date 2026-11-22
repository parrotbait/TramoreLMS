// Created by Claude driven by Eddie Long on 2026-10-31.
//
// What the pick screen shows for one entry in one week (PLAN.md section 9).

import {
    availableTeams,
    isBuybackAvailable,
    isEligibleForWeek,
    pickNeedsReplacing,
    usedTeamIds,
} from '@/engine'
import type { EntryId, Fixture, TeamId, Verdict } from '@/engine'
import { dublinDayKey, formatDublin, formatDublinDay, formatDublinTime } from '@/lib/format'

import { fixtureLabelOf, fixtureScoreLabel, fixturesOf, teamNameOf } from './context'
import type { ViewContext } from './context'

export type PickScreenStatus =
    | 'open'
    | 'locked'
    | 'waitingForResult'
    | 'out'
    | 'won'
    | 'competitionOver'
    | 'weekNotOpen'

export type TeamOptionState =
    | 'available'
    | 'used'
    | 'unavailable'

export interface TeamOption {
    readonly id: TeamId
    readonly name: string
    readonly crestUrl: string | null
    readonly state: TeamOptionState
    readonly usedInWeek: number | null
}

/**
 * How the player’s own pick fared in this game. `null` on every other game,
 * and on every game while picks are still open.
 */
export type PickResult =
    | 'through'
    | 'out'
    | 'waiting'

export interface FixtureOption {
    readonly id: string
    /** For example “15:00”. The day is on the group it sits in. */
    readonly timeLabel: string
    readonly scoreLabel: string | null
    readonly pickResult: PickResult | null
    readonly home: TeamOption
    readonly away: TeamOption
}

/** The games on one Irish day, in kick-off order. */
export interface FixtureDay {
    /** For example “2026-11-28”. */
    readonly key: string
    /** For example “Sat 28 Nov”. */
    readonly label: string
    readonly fixtures: readonly FixtureOption[]
}

export interface HistoryItem {
    readonly week: number
    readonly teamName: string
    readonly crestUrl: string | null
    readonly outcome: Verdict | 'pending'
    readonly auto: boolean
    readonly reinstated: boolean
}

export interface CurrentPick {
    readonly teamId: TeamId | null
    readonly teamName: string
    readonly crestUrl: string | null
    readonly auto: boolean
}

export interface PickScreenModel {
    readonly weekNumber: number
    readonly plMatchday: number
    readonly cutoffIso: string | null
    readonly cutoffLabel: string | null
    readonly nowIso: string
    readonly status: PickScreenStatus
    readonly currentPick: CurrentPick | null
    readonly needsRepick: boolean
    readonly fixtures: readonly FixtureOption[]
    /** The same games, grouped by Irish day. */
    readonly days: readonly FixtureDay[]
    readonly postponedLabels: readonly string[]
    readonly history: readonly HistoryItem[]
    readonly buybackAvailable: boolean
}

export interface WeekTab {
    readonly weekNumber: number
    /** For example “Week 1 · pending”. */
    readonly label: string
}

export interface PickScreenWeeks {
    /** The week to show. */
    readonly weekNumber: number
    /** Empty when there is nothing to switch to. */
    readonly tabs: readonly WeekTab[]
}

/**
 * Week N + 1 opens at the Week N cut-off, so a player can pick ahead as soon
 * as their own result is through (Decision 20). While Week N still has games
 * to play, the screen also offers a tab back to it, to see the locked pick and
 * how it is going. The latest week is shown unless the player asks for the
 * previous one. A player whose pick has lost sees only last week until its
 * games are all played, as next week is for players who are through.
 * A postponed game doesn't count as a game to play, so one called-off match
 * never keeps the tab up for weeks.
 */
export function pickScreenWeeks(
    context: ViewContext,
    entryId: EntryId,
    latestWeek: number,
    requestedWeek: number | null,
): PickScreenWeeks {
    const previousWeek = latestWeek - 1
    const standing = context.standings.entries.get(entryId)
    const previous = standing?.weeks.find((entryWeek) => {
        return entryWeek.week === previousWeek
    })
    const previousCutoff = context.state.weeks.find((week) => {
        return week.number === previousWeek
    })?.cutoffAt
    const hasLocked = previousCutoff !== null
        && previousCutoff !== undefined
        && context.now.getTime() >= previousCutoff.getTime()
    const hasGamesToPlay = fixturesOf(context, previousWeek).some((fixture) => {
        return fixture.override === undefined && fixture.state.kind === 'scheduled'
    })
    const isOutWhileWeekRuns = previous !== undefined
        && previous.outcome === 'out'
        && !previous.reinstated
        && hasGamesToPlay
    if (previousWeek >= 1 && hasLocked && isOutWhileWeekRuns) {
        return { weekNumber: previousWeek, tabs: [] }
    }

    if (previousWeek < 1 || previous === undefined || !hasLocked || !hasGamesToPlay) {
        return { weekNumber: latestWeek, tabs: [] }
    }

    return {
        weekNumber: requestedWeek === previousWeek ? previousWeek : latestWeek,
        tabs: [
            { weekNumber: previousWeek, label: `Week ${previousWeek} · ${previous.outcome}` },
            { weekNumber: latestWeek, label: `Week ${latestWeek}` },
        ],
    }
}

export function buildPickScreen(context: ViewContext, entryId: EntryId, weekNumber: number): PickScreenModel {
    const { state, standings, now } = context
    const week = state.weeks.find((candidate) => {
        return candidate.number === weekNumber
    })
    const cutoffAt = week?.cutoffAt ?? null
    const standing = standings.entries.get(entryId)
    const entryWeeks = standing?.weeks ?? []
    const pick = state.picks.find((candidate) => {
        return candidate.entryId === entryId && candidate.week === weekNumber
    })

    const status = statusOf(context, entryId, weekNumber, cutoffAt)
    const used = usedTeamIds(entryWeeks, weekNumber)
    const usedIn = new Map<TeamId, number>()
    for (const entryWeek of entryWeeks) {
        const teamId = entryWeek.pick?.teamId
        if (entryWeek.week < weekNumber && teamId !== undefined && teamId !== null) {
            usedIn.set(teamId, entryWeek.week)
        }
    }

    const available = new Set(availableTeams(state, standings, entryId, weekNumber, now).map((team) => {
        return team.id
    }))
    const optionFor = (teamId: TeamId): TeamOption => {
        const isUsed = used.has(teamId)
        const isAvailable = available.has(teamId) && status === 'open'
        return {
            id: teamId,
            name: teamNameOf(context, teamId),
            crestUrl: context.crestOf(teamId),
            state: isUsed ? 'used' : isAvailable ? 'available' : 'unavailable',
            usedInWeek: usedIn.get(teamId) ?? null,
        }
    }

    const weekFixtures = fixturesOf(context, weekNumber)
    const isPostponedNow = (fixture: Fixture) => {
        return fixture.state.kind === 'postponed' && fixture.state.at.getTime() <= now.getTime()
    }

    const shownFixtures = weekFixtures.filter((fixture) => {
        return status !== 'open' || !isPostponedNow(fixture)
    })
    const thisWeek = entryWeeks.find((entryWeek) => {
        return entryWeek.week === weekNumber
    })
    const pickResultOf = (fixture: Fixture): PickResult | null => {
        const teamId = thisWeek?.pick?.teamId
        const isPicked = teamId !== undefined
            && teamId !== null
            && (fixture.homeTeamId === teamId || fixture.awayTeamId === teamId)
        if (thisWeek === undefined || !isPicked || status === 'open' || status === 'weekNotOpen') {
            return null
        }

        if (thisWeek.outcome === 'pending') {
            return 'waiting'
        }

        return thisWeek.outcome === 'out' && !thisWeek.reinstated ? 'out' : 'through'
    }
    const optionOf = (fixture: Fixture): FixtureOption => {
        return {
            id: fixture.id,
            timeLabel: formatDublinTime(fixture.kickoffAt),
            scoreLabel: fixtureScoreLabel(fixture),
            pickResult: pickResultOf(fixture),
            home: optionFor(fixture.homeTeamId),
            away: optionFor(fixture.awayTeamId),
        }
    }

    return {
        weekNumber,
        plMatchday: context.plMatchdayOf(weekNumber),
        cutoffIso: cutoffAt?.toISOString() ?? null,
        cutoffLabel: cutoffAt === null ? null : formatDublin(cutoffAt),
        nowIso: now.toISOString(),
        status,
        currentPick: pick === undefined
            ? null
            : {
                teamId: pick.teamId,
                teamName: teamNameOf(context, pick.teamId),
                crestUrl: pick.teamId === null ? null : context.crestOf(pick.teamId),
                auto: pick.source !== 'player',
            },
        needsRepick: status === 'open' && pickNeedsReplacing(state, now, entryId, weekNumber),
        fixtures: shownFixtures.map(optionOf),
        days: groupByDay(shownFixtures, optionOf),
        postponedLabels: status === 'open'
            ? weekFixtures.filter(isPostponedNow).map((fixture) => {
                return fixtureLabelOf(context, fixture)
            })
            : [],
        history: entryWeeks.flatMap((entryWeek) => {
            if (entryWeek.pick === undefined || (entryWeek.week === weekNumber && status === 'open')) {
                return []
            }

            return [{
                week: entryWeek.week,
                teamName: teamNameOf(context, entryWeek.pick.teamId),
                crestUrl: entryWeek.pick.teamId === null ? null : context.crestOf(entryWeek.pick.teamId),
                outcome: entryWeek.outcome,
                auto: entryWeek.pick.source !== 'player',
                reinstated: entryWeek.reinstated,
            }]
        }),
        buybackAvailable: isBuybackAvailable(state, standings, now, entryId),
    }
}

function statusOf(
    context: ViewContext,
    entryId: EntryId,
    weekNumber: number,
    cutoffAt: Date | null,
): PickScreenStatus {
    const { state, standings, now } = context

    if (standings.outcome.kind === 'won') {
        return standings.outcome.winners.includes(entryId) ? 'won' : 'competitionOver'
    }

    if (cutoffAt === null) {
        return 'weekNotOpen'
    }

    const isBeforeCutoff = now.getTime() < cutoffAt.getTime()
    const isEligible = isEligibleForWeek(state, standings, entryId, weekNumber)
    const entryWeeks = standings.entries.get(entryId)?.weeks ?? []

    if (!isBeforeCutoff) {
        const isInThisWeek = entryWeeks.some((entryWeek) => {
            return entryWeek.week === weekNumber
        })
        return isInThisWeek || isEligible ? 'locked' : 'out'
    }

    if (isEligible) {
        return 'open'
    }

    const previous = entryWeeks.find((entryWeek) => {
        return entryWeek.week === weekNumber - 1
    })
    const isProvisional = standings.entries.get(entryId)?.status === 'provisionallyOut'
    if (previous?.outcome === 'pending' || isProvisional) {
        return 'waitingForResult'
    }

    return 'out'
}

/**
 * Groups games by Irish day, in kick-off order, so the screen can show each
 * date once above the games played on it. A match at 00:30 Irish time belongs
 * to the new day, whatever the time is in UTC.
 */
function groupByDay(
    fixtures: readonly Fixture[],
    optionOf: (fixture: Fixture) => FixtureOption,
): readonly FixtureDay[] {
    const days: { key: string; label: string; fixtures: FixtureOption[] }[] = []
    for (const fixture of fixtures) {
        const key = dublinDayKey(fixture.kickoffAt)
        const day = days.find((candidate) => {
            return candidate.key === key
        })
        if (day === undefined) {
            days.push({ key, label: formatDublinDay(fixture.kickoffAt), fixtures: [optionOf(fixture)] })
        } else {
            day.fixtures.push(optionOf(fixture))
        }
    }

    return days
}
