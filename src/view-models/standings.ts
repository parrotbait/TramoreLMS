// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Who is in and who is out. Signed-in players only (Decision 19).

import { splitPrize } from '@/engine'
import type { EntryId } from '@/engine'
import { formatEuro } from '@/lib/format'

import { teamNameOf } from './context'
import type { ViewContext } from './context'

export interface StandingRow {
    readonly entryId: EntryId
    readonly name: string
    readonly weeksSurvived: number
}

export interface OutRow {
    readonly entryId: EntryId
    readonly name: string
    readonly week: number
    readonly teamName: string
    readonly crestUrl: string | null
}

export interface StandingsModel {
    readonly lastSettledWeek: number
    readonly stillIn: readonly StandingRow[]
    readonly provisionallyOut: readonly StandingRow[]
    readonly out: readonly OutRow[]
    readonly totalEntries: number
    readonly headline: string
    readonly winnerLine: string | null
}

export function buildStandings(context: ViewContext, prizeCents: number): StandingsModel {
    const { standings } = context
    const stillIn: StandingRow[] = []
    const provisionallyOut: StandingRow[] = []
    const out: OutRow[] = []

    for (const standing of standings.entries.values()) {
        const row = {
            entryId: standing.entryId,
            name: context.nameOf(standing.entryId),
            weeksSurvived: standing.weeks.filter((entryWeek) => {
                return entryWeek.outcome === 'through' || entryWeek.reinstated
            }).length,
        }

        switch (standing.status) {
            case 'in':
            case 'winner':
                stillIn.push(row)
                break
            case 'provisionallyOut':
                provisionallyOut.push(row)
                break
            case 'out':
            case 'withdrawn': {
                const lastWeek = standing.weeks.at(-1)
                out.push({
                    entryId: row.entryId,
                    name: row.name,
                    week: standing.eliminatedInWeek ?? lastWeek?.week ?? 0,
                    teamName: teamNameOf(context, lastWeek?.pick?.teamId ?? null),
                    crestUrl: crestOfPick(context, lastWeek?.pick?.teamId),
                })
                break
            }
        }
    }

    const byName = (left: { name: string }, right: { name: string }) => {
        return left.name.localeCompare(right.name)
    }

    return {
        lastSettledWeek: standings.lastSettledWeek,
        stillIn: stillIn.sort(byName),
        provisionallyOut: provisionallyOut.sort(byName),
        out: out.sort((left, right) => {
            return right.week - left.week || left.name.localeCompare(right.name)
        }),
        totalEntries: standings.entries.size,
        headline: `${stillIn.length + provisionallyOut.length} of ${standings.entries.size} still standing`,
        winnerLine: winnerLineOf(context, prizeCents),
    }
}

function crestOfPick(context: ViewContext, teamId: string | null | undefined): string | null {
    if (teamId === undefined || teamId === null) {
        return null
    }

    return context.crestOf(teamId)
}

function winnerLineOf(context: ViewContext, prizeCents: number): string | null {
    const { outcome } = context.standings
    if (outcome.kind !== 'won') {
        return null
    }

    const names = outcome.winners.map(context.nameOf)
    if (names.length === 1) {
        return `🏆 ${names[0]} wins ${formatEuro(prizeCents)} after Week ${outcome.week}`
    }

    const split = splitPrize(prizeCents, names.length)
    return `🏆 ${names.join(', ')} share the prize: ${formatEuro(split.perWinnerCents)} each`
}
