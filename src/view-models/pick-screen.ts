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
import { formatDublin } from '@/lib/format'

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

export interface FixtureOption {
    readonly id: string
    readonly kickoffLabel: string
    readonly scoreLabel: string | null
    readonly home: TeamOption
    readonly away: TeamOption
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
    readonly postponedLabels: readonly string[]
    readonly history: readonly HistoryItem[]
    readonly buybackAvailable: boolean
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
        fixtures: weekFixtures
            .filter((fixture) => {
                return status !== 'open' || !isPostponedNow(fixture)
            })
            .map((fixture) => {
                return {
                    id: fixture.id,
                    kickoffLabel: formatDublin(fixture.kickoffAt),
                    scoreLabel: fixtureScoreLabel(fixture),
                    home: optionFor(fixture.homeTeamId),
                    away: optionFor(fixture.awayTeamId),
                }
            }),
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
