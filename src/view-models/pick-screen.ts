// Created by Claude driven by Eddie Long on 2026-10-31.
//
// What the pick screen shows for one entry in one week (PLAN.md section 9).

import {
    availableTeams,
    isBuybackAvailable,
    isEligibleForWeek,
    pickNeedsReplacing,
    teamsPlayingIn,
    usedTeamWeeks,
} from '@/engine'
import type { EntryId, EntryWeek, Fixture, TeamId, Verdict } from '@/engine'
import { dublinDayKey, formatDublin, formatDublinDay, formatDublinTime } from '@/lib/format'

import { fixtureLabelOf, fixtureScoreLabel, fixturesOf, teamNameOf } from './context'
import type { ViewContext } from './context'
import { crowdLines, crowdOf, fallbackTeamName, outCauseOf } from './pick-screen-extras'
import type { Crowd } from './pick-screen-extras'

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
 *
 * `through` is only for a win, a game called off, or a decision by the
 * organiser. A draw or a loss is `out`, or `staysIn` when everyone still in
 * went out together, so everyone stays in (rule 6). The words are made in
 * `describePickResult` and nowhere else, so a draw can never read “through”.
 */
export type PickResultKind =
    | 'through'
    | 'out'
    | 'staysIn'
    | 'waiting'

export interface PickResult {
    readonly kind: PickResultKind
    /** What the player reads, in very simple English. */
    readonly text: string
}

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
    /** What everyone picked, once picks have closed. `null` before then. */
    readonly crowd: Crowd | null
    /** The crowd in words, for under “Picks are closed”. Empty before the cut-off. */
    readonly crowdLines: readonly string[]
    /** The team we pick for you if you do nothing, while picks are open and you have none. */
    readonly fallbackTeamName: string | null
    /** Why you are out, for a player who is out. */
    readonly outCause: string | null
}

/**
 * The week the pick screen shows: the first one that has not settled.
 *
 * Next week can only be picked once this week has settled (every player's
 * result is final), so until then everyone sees this week. A player sees their locked
 * pick and how it is going, and nothing of next week. Week N + 1 may already be
 * open in the database, as it opens at the Week N cut-off, but it is out of sight.
 */
export function pickScreenWeek(context: ViewContext, latestWeek: number): number {
    return Math.min(latestWeek, context.standings.lastSettledWeek + 1)
}

/**
 * The words for how a pick fared. The only place that says “through”.
 *
 * “Through” needs a win, a game called off, a pass, or the organiser’s say.
 * Anything else that reaches here as through is shown as still being
 * checked, never as a pass. A draw is out, and a loss is out. If everyone
 * went out together they all stay in, and the text says why.
 */
export function describePickResult(week: Pick<EntryWeek, 'outcome' | 'reason' | 'reinstated'>): PickResult {
    if (week.outcome === 'pending') {
        return { kind: 'waiting', text: 'Waiting for result' }
    }

    if (week.outcome === 'through') {
        switch (week.reason) {
            case 'win':
            case 'pass':
                return { kind: 'through', text: 'You’re through ✓' }
            case 'void':
                return { kind: 'through', text: 'Game called off. You’re through ✓' }
            case 'pickOverride':
                return { kind: 'through', text: 'The organiser put you through ✓' }
            default:
                return { kind: 'waiting', text: 'Checking your result' }
        }
    }

    if (week.reinstated) {
        return { kind: 'staysIn', text: 'You’re out, but everyone went out, so everyone stays in ↺' }
    }

    switch (week.reason) {
        case 'draw':
            return { kind: 'out', text: 'A draw is out. You’re out ✗' }
        case 'loss':
            return { kind: 'out', text: 'You lost. You’re out ✗' }
        case 'pickOverride':
            return { kind: 'out', text: 'The organiser put you out ✗' }
        default:
            return { kind: 'out', text: 'You’re out ✗' }
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
    // The same list the engine uses. If every team that plays this week is used, it has started again.
    const usedIn = usedTeamWeeks(entryWeeks, weekNumber, teamsPlayingIn(state, weekNumber, cutoffAt ?? now))
    const used = new Set(usedIn.keys())

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

        return describePickResult(thisWeek)
    }
    const needsRepick = status === 'open' && pickNeedsReplacing(state, now, entryId, weekNumber)
    const hasClosed = cutoffAt !== null && now.getTime() >= cutoffAt.getTime()
    const crowd = hasClosed ? crowdOf(context, entryId, weekNumber) : null
    const yourTeamName = pick === undefined || pick.teamId === null ? null : teamNameOf(context, pick.teamId)
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
        needsRepick,
        crowd,
        crowdLines: crowd === null ? [] : crowdLines(crowd, yourTeamName),
        fallbackTeamName: status === 'open' && (pick === undefined || pick.teamId === null || needsRepick)
            ? fallbackTeamName(context, entryId, weekNumber, cutoffAt ?? now)
            : null,
        outCause: status === 'out' ? outCauseOf(context, entryId) : null,
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
    // Nobody picks until the whole of last week has settled, not even a player who is through.
    const isPreviousWeekUnsettled = standings.lastSettledWeek < weekNumber - 1
    if (previous !== undefined && isPreviousWeekUnsettled) {
        return 'waitingForResult'
    }

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
