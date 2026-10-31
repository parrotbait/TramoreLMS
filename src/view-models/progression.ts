// Created by Claude driven by Eddie Long on 2026-10-31.
//
// The standings as a week-by-week grid: one row per player, one column per
// week, the pick's crest in each cell. Like the organiser's old spreadsheet:
// still in first, then everyone out, most recent week first.

import type { EntryId, EntryWeek, Verdict } from '@/engine'

import { fixtureLabelOf, fixtureScoreLabel, fixturesOf, teamNameOf } from './context'
import type { ViewContext } from './context'

export type ProgressionCell =
    | {
        readonly kind: 'pick'
        readonly teamName: string
        readonly crestUrl: string | null
        readonly outcome: Verdict | 'pending'
        readonly auto: boolean
        readonly reinstated: boolean
        readonly override: boolean
        /** The first pick after buying back in, which is always Week 2. */
        readonly boughtBack: boolean
        readonly matchLabel: string | null
    }
    /** Before the cut-off. Nobody's pick is shown, not even whether they have picked. */
    | { readonly kind: 'hidden' }
    /** No pick recorded for a week the player was in (a pick override with no pick). */
    | { readonly kind: 'noPick'; readonly outcome: Verdict | 'pending' }
    /** The player was not in this week. */
    | { readonly kind: 'empty' }

export interface ProgressionWeek {
    readonly number: number
    readonly plMatchday: number
    /** Players still in after this week. `null` until the week settles. */
    readonly survivorsAfter: number | null
}

export interface ProgressionRow {
    readonly entryId: EntryId
    readonly name: string
    readonly isWinner: boolean
    readonly isProvisionallyOut: boolean
    readonly cells: readonly ProgressionCell[]
}

export interface ProgressionSection {
    readonly key: string
    readonly title: string
    readonly isStillIn: boolean
    readonly rows: readonly ProgressionRow[]
}

export interface ProgressionModel {
    readonly totalEntries: number
    readonly weeks: readonly ProgressionWeek[]
    readonly sections: readonly ProgressionSection[]
}

export function buildProgression(context: ViewContext): ProgressionModel {
    const { state, standings, now } = context
    const weeks = [...state.weeks]
        .filter((week) => {
            return week.number <= state.finalWeek
        })
        .sort((left, right) => {
            return left.number - right.number
        })
    const boughtBack = new Set(state.entries
        .filter((entry) => {
            return entry.boughtBack
        })
        .map((entry) => {
            return entry.id
        }))

    const revealed = new Map(weeks.map((week) => {
        return [week.number, week.cutoffAt !== null && now.getTime() >= week.cutoffAt.getTime()] as const
    }))

    const rows: (ProgressionRow & { readonly sortWeek: number })[] = []
    for (const standing of standings.entries.values()) {
        const byWeek = new Map(standing.weeks.map((entryWeek) => {
            return [entryWeek.week, entryWeek] as const
        }))

        rows.push({
            entryId: standing.entryId,
            name: context.nameOf(standing.entryId),
            isWinner: standing.status === 'winner',
            isProvisionallyOut: standing.status === 'provisionallyOut',
            sortWeek: standing.status === 'out' || standing.status === 'withdrawn'
                ? standing.eliminatedInWeek ?? standing.weeks.at(-1)?.week ?? 0
                : Number.POSITIVE_INFINITY,
            cells: weeks.map((week) => {
                const entryWeek = byWeek.get(week.number)
                if (entryWeek === undefined) {
                    return { kind: 'empty' }
                }

                if (revealed.get(week.number) !== true) {
                    return { kind: 'hidden' }
                }

                return cellOf(context, entryWeek, week.number === 2 && boughtBack.has(standing.entryId))
            }),
        })
    }

    rows.sort((left, right) => {
        return Number(right.isWinner) - Number(left.isWinner)
            || right.sortWeek - left.sortWeek
            || left.name.localeCompare(right.name)
    })

    return {
        totalEntries: standings.entries.size,
        weeks: weeks.map((week) => {
            return {
                number: week.number,
                plMatchday: context.plMatchdayOf(week.number),
                survivorsAfter: survivorsAfter(context, week.number, boughtBack),
            }
        }),
        sections: sectionsOf(rows),
    }
}

function cellOf(context: ViewContext, entryWeek: EntryWeek, boughtBack: boolean): ProgressionCell {
    const pick = entryWeek.pick
    if (pick === undefined || pick.teamId === null) {
        return pick?.source === 'autoPass'
            ? {
                kind: 'pick',
                teamName: 'Pass',
                crestUrl: null,
                outcome: entryWeek.outcome,
                auto: true,
                reinstated: entryWeek.reinstated,
                override: entryWeek.reason === 'pickOverride',
                boughtBack,
                matchLabel: null,
            }
            : { kind: 'noPick', outcome: entryWeek.outcome }
    }

    const teamId = pick.teamId
    const fixture = fixturesOf(context, entryWeek.week).find((candidate) => {
        return candidate.homeTeamId === teamId || candidate.awayTeamId === teamId
    })
    const score = fixture === undefined ? null : fixtureScoreLabel(fixture)

    return {
        kind: 'pick',
        teamName: teamNameOf(context, teamId),
        crestUrl: context.crestOf(teamId),
        outcome: entryWeek.outcome,
        auto: pick.source !== 'player',
        reinstated: entryWeek.reinstated,
        override: entryWeek.reason === 'pickOverride',
        boughtBack,
        matchLabel: fixture === undefined ? null : `${fixtureLabelOf(context, fixture)}${score === null ? '' : ` ${score}`}`,
    }
}

function survivorsAfter(context: ViewContext, weekNumber: number, boughtBack: ReadonlySet<EntryId>): number | null {
    if (weekNumber > context.standings.lastSettledWeek) {
        return null
    }

    let count = 0
    for (const standing of context.standings.entries.values()) {
        const entryWeek = standing.weeks.find((candidate) => {
            return candidate.week === weekNumber
        })
        if (entryWeek === undefined) {
            continue
        }

        const isBoughtBack = weekNumber === 1 && boughtBack.has(standing.entryId)
        if (entryWeek.outcome === 'through' || entryWeek.reinstated || isBoughtBack) {
            count += 1
        }
    }

    return count
}

function sectionsOf(rows: readonly (ProgressionRow & { readonly sortWeek: number })[]): ProgressionSection[] {
    const stillIn = rows.filter((row) => {
        return row.sortWeek === Number.POSITIVE_INFINITY
    })
    const out = rows.filter((row) => {
        return row.sortWeek !== Number.POSITIVE_INFINITY
    })

    const outWeeks = [...new Set(out.map((row) => {
        return row.sortWeek
    }))].sort((left, right) => {
        return right - left
    })

    const sections: ProgressionSection[] = []
    if (stillIn.length > 0) {
        sections.push({ key: 'in', title: `Still in (${stillIn.length})`, isStillIn: true, rows: stillIn })
    }

    for (const week of outWeeks) {
        const weekRows = out.filter((row) => {
            return row.sortWeek === week
        })
        sections.push({
            key: `out-${week}`,
            title: `Out in Week ${week} (${weekRows.length})`,
            isStillIn: false,
            rows: weekRows,
        })
    }

    return sections
}
