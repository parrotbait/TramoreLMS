// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Everyone's picks for one week. Read-only, and empty until the cut-off
// (Decision 12b).

import type { EntryWeek, Verdict } from '@/engine'
import { formatDublin } from '@/lib/format'

import { fixtureLabelOf, fixtureScoreLabel, fixturesOf, teamNameOf } from './context'
import type { ViewContext } from './context'

export interface RevealedPlayer {
    readonly name: string
    readonly auto: boolean
    readonly outcome: Verdict | 'pending'
    readonly reinstated: boolean
    readonly override: boolean
}

export interface RevealedGroup {
    readonly teamName: string
    readonly crestUrl: string | null
    readonly fixtureLabel: string | null
    readonly scoreLabel: string | null
    readonly players: readonly RevealedPlayer[]
}

export interface PicksRevealModel {
    readonly weekNumber: number
    readonly plMatchday: number
    readonly cutoffLabel: string | null
    readonly isRevealed: boolean
    readonly groups: readonly RevealedGroup[]
    readonly totalPlayers: number
}

export function buildPicksReveal(context: ViewContext, weekNumber: number): PicksRevealModel {
    const { state, standings, now } = context
    const cutoffAt = state.weeks.find((week) => {
        return week.number === weekNumber
    })?.cutoffAt ?? null
    const isRevealed = cutoffAt !== null && now.getTime() >= cutoffAt.getTime()
    const base = {
        weekNumber,
        plMatchday: context.plMatchdayOf(weekNumber),
        cutoffLabel: cutoffAt === null ? null : formatDublin(cutoffAt),
        isRevealed,
    }

    if (!isRevealed) {
        return { ...base, groups: [], totalPlayers: 0 }
    }

    const weekFixtures = fixturesOf(context, weekNumber)
    const groups = new Map<string, RevealedGroup & { players: RevealedPlayer[] }>()

    for (const standing of standings.entries.values()) {
        const entryWeek = standing.weeks.find((candidate) => {
            return candidate.week === weekNumber
        })
        if (entryWeek === undefined) {
            continue
        }

        const teamId = entryWeek.pick?.teamId ?? null
        const key = teamId ?? (entryWeek.pick === undefined ? 'none' : 'pass')
        const fixture = teamId === null
            ? undefined
            : weekFixtures.find((candidate) => {
                return candidate.homeTeamId === teamId || candidate.awayTeamId === teamId
            })

        const group = groups.get(key) ?? {
            teamName: entryWeek.pick === undefined ? 'No pick yet' : teamNameOf(context, teamId),
            crestUrl: teamId === null ? null : context.crestOf(teamId),
            fixtureLabel: fixture === undefined ? null : fixtureLabelOf(context, fixture),
            scoreLabel: fixture === undefined ? null : fixtureScoreLabel(fixture),
            players: [],
        }
        group.players.push(toPlayer(context.nameOf(standing.entryId), entryWeek))
        groups.set(key, group)
    }

    const sorted = [...groups.values()].sort((left, right) => {
        return right.players.length - left.players.length || left.teamName.localeCompare(right.teamName)
    })

    return {
        ...base,
        groups: sorted.map((group) => {
            return {
                ...group,
                players: [...group.players].sort((left, right) => {
                    return left.name.localeCompare(right.name)
                }),
            }
        }),
        totalPlayers: sorted.reduce((sum, group) => {
            return sum + group.players.length
        }, 0),
    }
}

function toPlayer(name: string, entryWeek: EntryWeek): RevealedPlayer {
    return {
        name,
        auto: entryWeek.pick !== undefined && entryWeek.pick.source !== 'player',
        outcome: entryWeek.outcome,
        reinstated: entryWeek.reinstated,
        override: entryWeek.reason === 'pickOverride',
    }
}
