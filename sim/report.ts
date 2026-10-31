// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Prints what happened each week, and the final result.

import { splitPrize } from '@/engine'
import type { EntryWeek, Fixture, Standings } from '@/engine'
import { formatDublin, formatEuro } from '@/lib/format'

import type { SimCompetition } from './competition'
import { fixtureLabel } from './random-driver'
import type { WeekLog } from './week'

export interface ReportOptions {
    readonly verbose: boolean
    readonly plMatchday: number
}

export function describeWeek(
    competition: SimCompetition,
    log: WeekLog,
    standings: Standings,
    options: ReportOptions,
): string {
    const lines: string[] = []
    lines.push('')
    lines.push(`Week ${log.weekNumber} · PL Matchday ${options.plMatchday} · Cut-off ${formatDublin(log.cutoffAt)}`)

    const entryWeeks = [...standings.entries.values()].flatMap((standing) => {
        const entryWeek = standing.weeks.find((candidate) => {
            return candidate.week === log.weekNumber
        })
        return entryWeek === undefined ? [] : [{ entryId: standing.entryId, entryWeek }]
    })

    lines.push(`  Picks: ${pickCounts(competition, entryWeeks.map((item) => {
        return item.entryWeek
    }))}`)

    if (options.verbose) {
        lines.push('  Results:')
        for (const fixture of competition.fixturesOf(log.weekNumber)) {
            lines.push(`    ${fixtureLabel(competition, fixture)}  ${describeFixture(fixture)}`)
        }
        lines.push('  Players:')
        for (const { entryId, entryWeek } of entryWeeks) {
            const team = competition.teamName(entryWeek.pick?.teamId ?? null)
            const auto = entryWeek.pick?.source === 'player' ? '' : ' (Auto)'
            const reinstated = entryWeek.reinstated ? ' (everyone out, all stay in)' : ''
            lines.push(`    ${entryId.padEnd(12)} ${`${team}${auto}`.padEnd(32)} ${entryWeek.outcome} · ${entryWeek.reason}${reinstated}`)
        }
    }

    for (const rejection of log.rejections) {
        lines.push(`  Rejected: ${rejection.entryId} → ${competition.teamName(rejection.teamId)} (${rejection.reason})`)
    }

    const weekFixtureIds = new Set(competition.fixturesOf(log.weekNumber).map((fixture) => {
        return fixture.id
    }))
    for (const held of competition.heldFixtures) {
        if (weekFixtureIds.has(held.fixtureId)) {
            lines.push(`  ⚠ Held for admin: ${held.fixtureId} (${held.reason})`)
        }
    }

    const outThisWeek = [...standings.entries.values()].filter((standing) => {
        return standing.eliminatedInWeek === log.weekNumber
    })
    if (outThisWeek.length > 0) {
        lines.push(`  Out this week: ${outThisWeek.map((standing) => {
            return standing.entryId
        }).join(', ')}`)
    }

    const stillIn = [...standings.entries.values()].filter((standing) => {
        return standing.status === 'in' || standing.status === 'winner'
    }).length
    lines.push(`  Still in: ${stillIn} of ${standings.entries.size}`)

    return lines.join('\n')
}

export function describeOutcome(standings: Standings, prizeCents: number): string {
    switch (standings.outcome.kind) {
        case 'running':
            return '\nThe competition is still running.'
        case 'noPlayers':
            return '\nNo players left.'
        case 'won':
            break
    }

    const { winners, week } = standings.outcome
    const split = splitPrize(prizeCents, winners.length)

    if (winners.length === 1) {
        return `\n🏆 Winner: ${winners[0]} after Week ${week} · Prize ${formatEuro(prizeCents)}`
    }

    return [
        `\n🏆 Shared by ${winners.length} after Week ${week}: ${winners.join(', ')}`,
        `   ${formatEuro(split.perWinnerCents)} each · ${formatEuro(split.remainderCents)} left over for the club`,
    ].join('\n')
}

function pickCounts(competition: SimCompetition, entryWeeks: readonly EntryWeek[]): string {
    const counts = new Map<string, { total: number; auto: number }>()

    for (const entryWeek of entryWeeks) {
        const name = competition.teamName(entryWeek.pick?.teamId ?? null)
        const current = counts.get(name) ?? { total: 0, auto: 0 }
        const isAuto = entryWeek.pick !== undefined && entryWeek.pick.source !== 'player'
        counts.set(name, { total: current.total + 1, auto: current.auto + (isAuto ? 1 : 0) })
    }

    return [...counts.entries()]
        .sort(([, left], [, right]) => {
            return right.total - left.total
        })
        .map(([name, count]) => {
            const auto = count.auto > 0 ? ` (${count.auto} auto)` : ''
            return `${name} ×${count.total}${auto}`
        })
        .join(', ')
}

function describeFixture(fixture: Fixture): string {
    if (fixture.override !== undefined) {
        return fixture.override.kind === 'void' ? 'void (admin)' : `${fixture.override.home}-${fixture.override.away} (admin)`
    }

    switch (fixture.state.kind) {
        case 'scheduled':
            return 'not played'
        case 'postponed':
            return 'postponed'
        case 'abandoned':
            return 'abandoned'
        case 'finished':
            return `${fixture.state.home}-${fixture.state.away}`
    }
}
