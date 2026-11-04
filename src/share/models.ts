// Created by Claude driven by Eddie Long on 2026-11-04.
//
// What the WhatsApp outputs say (PLAN.md section 10). Pure, so it is tested.
//
//   Copy reminder        text, counts only, never names (Decision 11)
//   Status image         after a settled week, with names (Decision 16)
//   Picks-revealed image players per team, no names

import { isBuybackWindowOpen, isEligibleForWeek, splitPrize } from '@/engine'
import { formatDublin, formatEuro } from '@/lib/format'
import { fixtureScoreLabel, fixturesOf, teamNameOf } from '@/view-models/context'
import type { ViewContext } from '@/view-models/context'

export interface ShareSettings {
    readonly competitionName: string
    readonly siteUrl: string
    readonly prizeCents: number
    readonly buybackFeeCents: number
}

/** Above this many players, the status image shows counts, not names. */
export const NAMES_LIMIT = 150

export function reminderText(context: ViewContext, settings: ShareSettings, weekNumber: number): string {
    const { state, standings } = context
    const week = state.weeks.find((candidate) => {
        return candidate.number === weekNumber
    })
    const site = settings.siteUrl.replace(/\/$/, '')

    const eligible = state.entries.filter((entry) => {
        return isEligibleForWeek(state, standings, entry.id, weekNumber)
    })
    const picked = eligible.filter((entry) => {
        return state.picks.some((pick) => {
            return pick.entryId === entry.id && pick.week === weekNumber
        })
    })
    const notPicked = eligible.length - picked.length

    const lines = [
        `⚽ Tramore Athletic Last Man Standing, Week ${weekNumber} (PL Matchday ${context.plMatchdayOf(weekNumber)})`,
        `Cut-off: ${week?.cutoffAt === null || week === undefined ? 'to be confirmed' : formatDublin(week.cutoffAt)}`,
        `${eligible.length} still in · ${notPicked === 0 ? 'everyone has picked' : `${notPicked} haven’t picked yet`}`,
        `Pick here 👉 ${site}/pick`,
        `No pick = auto-assigned. Rules: ${site}/rules`,
    ]

    const weekTwo = state.weeks.find((candidate) => {
        return candidate.number === 2
    })
    const isBuybackTime = standings.lastSettledWeek >= 1 && weekNumber === 2 && isBuybackWindowOpen(state, context.now)
    if (isBuybackTime) {
        const until = weekTwo?.cutoffAt === null || weekTwo === undefined ? 'the Week 2 cut-off' : formatDublin(weekTwo.cutoffAt)
        lines.push(`Out in Week 1? Buy back in for ${formatEuro(settings.buybackFeeCents)} until ${until}.`)
    }

    return lines.join('\n')
}

export interface OutPlayer {
    readonly name: string
    readonly teamName: string
    readonly scoreLabel: string | null
}

export interface StatusImageModel {
    readonly title: string
    readonly subtitle: string
    readonly headline: string
    /** `null` when there are too many players to list. */
    readonly stillIn: readonly string[] | null
    readonly outThisWeek: readonly OutPlayer[] | null
    readonly outEarlier: number
    readonly winnerLine: string | null
    readonly footer: string
}

/** The standings after a settled week, for the WhatsApp group. */
export function statusImageModel(context: ViewContext, settings: ShareSettings, weekNumber: number): StatusImageModel {
    const { standings } = context
    const all = [...standings.entries.values()]
    const total = all.length
    const isIn = (status: string) => {
        return status === 'in' || status === 'winner' || status === 'provisionallyOut'
    }

    const stillIn = all
        .filter((standing) => {
            return isIn(standing.status)
        })
        .map((standing) => {
            return context.nameOf(standing.entryId)
        })
        .sort((left, right) => {
            return left.localeCompare(right)
        })

    const weekFixtures = fixturesOf(context, weekNumber)
    const outThisWeek = all
        .filter((standing) => {
            return standing.eliminatedInWeek === weekNumber
        })
        .map((standing) => {
            const teamId = standing.weeks.find((entryWeek) => {
                return entryWeek.week === weekNumber
            })?.pick?.teamId ?? null
            const fixture = teamId === null
                ? undefined
                : weekFixtures.find((candidate) => {
                    return candidate.homeTeamId === teamId || candidate.awayTeamId === teamId
                })
            return {
                name: context.nameOf(standing.entryId),
                teamName: teamNameOf(context, teamId),
                scoreLabel: fixture === undefined ? null : fixtureScoreLabel(fixture),
            }
        })
        .sort((left, right) => {
            return left.name.localeCompare(right.name)
        })

    const outEarlier = all.filter((standing) => {
        return standing.eliminatedInWeek !== null && standing.eliminatedInWeek < weekNumber
    }).length

    const nextWeek = context.state.weeks.find((week) => {
        return week.number === weekNumber + 1
    })
    const nextCutoff = nextWeek?.cutoffAt === null || nextWeek === undefined ? null : formatDublin(nextWeek.cutoffAt)
    const tooMany = total > NAMES_LIMIT

    return {
        title: settings.competitionName,
        subtitle: `After Week ${weekNumber} · PL Matchday ${context.plMatchdayOf(weekNumber)}`,
        headline: `${stillIn.length} of ${total} still standing`,
        stillIn: tooMany ? null : stillIn,
        outThisWeek: tooMany ? null : outThisWeek,
        outEarlier,
        winnerLine: winnerLine(context, settings),
        footer: [
            `Prize ${formatEuro(settings.prizeCents)}`,
            nextCutoff === null ? null : `Next cut-off ${nextCutoff}`,
            settings.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''),
        ].filter((part) => {
            return part !== null
        }).join(' · '),
    }
}

export interface TeamCount {
    readonly teamName: string
    readonly crestUrl: string | null
    readonly count: number
}

export interface PicksImageModel {
    readonly title: string
    readonly subtitle: string
    readonly teams: readonly TeamCount[]
    readonly total: number
    readonly isRevealed: boolean
}

/** How many players picked each team. No names. Empty until the cut-off. */
export function picksImageModel(context: ViewContext, settings: ShareSettings, weekNumber: number): PicksImageModel {
    const week = context.state.weeks.find((candidate) => {
        return candidate.number === weekNumber
    })
    const cutoffAt = week?.cutoffAt ?? null
    const isRevealed = cutoffAt !== null && context.now.getTime() >= cutoffAt.getTime()
    const base = {
        title: settings.competitionName,
        subtitle: `Week ${weekNumber} picks · PL Matchday ${context.plMatchdayOf(weekNumber)}`,
        isRevealed,
    }
    if (!isRevealed) {
        return { ...base, teams: [], total: 0 }
    }

    const counts = new Map<string | null, number>()
    for (const standing of context.standings.entries.values()) {
        const entryWeek = standing.weeks.find((candidate) => {
            return candidate.week === weekNumber
        })
        if (entryWeek?.pick === undefined) {
            continue
        }

        counts.set(entryWeek.pick.teamId, (counts.get(entryWeek.pick.teamId) ?? 0) + 1)
    }

    const teams = [...counts.entries()]
        .map(([teamId, count]) => {
            return {
                teamName: teamNameOf(context, teamId),
                crestUrl: teamId === null ? null : context.crestOf(teamId),
                count,
            }
        })
        .sort((left, right) => {
            return right.count - left.count || left.teamName.localeCompare(right.teamName)
        })

    return {
        ...base,
        teams,
        total: teams.reduce((sum, team) => {
            return sum + team.count
        }, 0),
    }
}

function winnerLine(context: ViewContext, settings: ShareSettings): string | null {
    const { outcome } = context.standings
    if (outcome.kind !== 'won') {
        return null
    }

    const names = outcome.winners.map(context.nameOf)
    if (names.length === 1) {
        return `🏆 ${names[0]} wins ${formatEuro(settings.prizeCents)}!`
    }

    const split = splitPrize(settings.prizeCents, names.length)
    return `🏆 ${names.join(', ')} share the prize: ${formatEuro(split.perWinnerCents)} each`
}
