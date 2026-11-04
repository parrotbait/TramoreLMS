// Created by Claude driven by Eddie Long on 2026-11-04.
//
// One week: the cut-off, every fixture with its feed and admin result, and
// every player's pick and outcome. Both override levels live here (Decision 9).

import { notFound } from 'next/navigation'

import { overrideCutoffAction, overrideFixtureAction, overridePickAction } from '@/admin/actions'
import { toDublinInputValue } from '@/admin/forms'
import { loadAdminCompetition } from '@/admin/load'
import { CompetitionNav } from '@/components/admin/CompetitionNav'
import { ActionPanel, Card, Field, ReasonField, Submit } from '@/components/admin/ui'
import { formatDublin } from '@/lib/format'
import { fixtureScoreLabel, teamNameOf } from '@/view-models/context'

interface WeekProps {
    readonly params: Promise<{ readonly id: string; readonly week: string }>
}

export default async function WeekPage({ params }: WeekProps) {
    const { id, week: weekParam } = await params
    const data = await loadAdminCompetition(id)
    const { rows, context, currentWeek } = data
    const weekNumber = Number(weekParam)
    const week = rows.weeks.find((candidate) => {
        return candidate.number === weekNumber
    })
    if (week === undefined) {
        notFound()
    }

    const weekFixtures = context.state.fixtures
        .filter((fixture) => {
            return fixture.week === weekNumber
        })
        .sort((left, right) => {
            return left.kickoffAt.getTime() - right.kickoffAt.getTime()
        })
    const fixtureRows = new Map(rows.fixtures.map((fixture) => {
        return [fixture.id, fixture] as const
    }))
    const pickersOf = (teamId: string) => {
        return context.state.picks.filter((pick) => {
            return pick.week === weekNumber && pick.teamId === teamId
        }).length
    }

    const players = [...context.standings.entries.values()]
        .flatMap((standing) => {
            const entryWeek = standing.weeks.find((candidate) => {
                return candidate.week === weekNumber
            })
            return entryWeek === undefined ? [] : [{ entryId: standing.entryId, entryWeek }]
        })
        .sort((left, right) => {
            return context.nameOf(left.entryId).localeCompare(context.nameOf(right.entryId))
        })

    return (
        <>
            <CompetitionNav competitionId={id} name={rows.competition.name} currentWeek={currentWeek} />

            <Card title={`Week ${week.number} · PL Matchday ${week.plMatchday}`}>
                <p className="text-sm">
                    Cut-off: <strong>{week.cutoffAt === null ? 'not open yet' : formatDublin(week.cutoffAt)}</strong>
                    {week.cutoffOverridden ? ' (moved by an admin)' : ''}
                    {week.settledAt === null ? '' : ` · settled ${formatDublin(week.settledAt)}`}
                </p>
                <ActionPanel label="Move the cut-off">
                    <form action={overrideCutoffAction.bind(null, week.id)} className="grid gap-2 sm:grid-cols-2">
                        <Field
                            label="New cut-off (Irish time)"
                            name="cutoff"
                            type="datetime-local"
                            required
                            defaultValue={week.cutoffAt === null ? undefined : toDublinInputValue(week.cutoffAt)}
                        />
                        <ReasonField />
                        <div>
                            <Submit>Move cut-off</Submit>
                        </div>
                    </form>
                </ActionPanel>
            </Card>

            <Card title="Fixtures">
                <ul className="divide-y divide-line">
                    {weekFixtures.map((fixture) => {
                        const row = fixtureRows.get(fixture.id)
                        const feed = row === undefined ? '' : feedLabel(row)
                        const home = teamNameOf(context, fixture.homeTeamId)
                        const away = teamNameOf(context, fixture.awayTeamId)
                        return (
                            <li key={fixture.id} className="space-y-2 py-3">
                                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                                    <span>
                                        <strong>{home}</strong> v <strong>{away}</strong>
                                        <span className="text-muted"> · {formatDublin(fixture.kickoffAt)}</span>
                                    </span>
                                    <span className="text-right">
                                        <span className="font-semibold">{fixtureScoreLabel(fixture) ?? 'Not played'}</span>
                                        <span className="block text-xs text-muted">
                                            Feed: {feed} · picked by {pickersOf(fixture.homeTeamId)}
                                            {' / '}
                                            {pickersOf(fixture.awayTeamId)}
                                            {row?.overrideReason === null || row?.overrideReason === undefined ? '' : ` · admin: ${row.overrideReason}`}
                                        </span>
                                    </span>
                                </div>
                                <ActionPanel label="Set the result">
                                    <form action={overrideFixtureAction.bind(null, fixture.id)} className="grid gap-2 sm:grid-cols-3">
                                        <Field label="Result" name="result" required placeholder="2-1, void or clear" hint="Home score first. The feed never undoes this." />
                                        <ReasonField />
                                        <div className="flex items-end">
                                            <Submit>Save result</Submit>
                                        </div>
                                    </form>
                                </ActionPanel>
                            </li>
                        )
                    })}
                </ul>
            </Card>

            <Card title={`Players (${players.length})`}>
                <ul className="divide-y divide-line">
                    {players.map(({ entryId, entryWeek }) => {
                        const pick = entryWeek.pick
                        const team = pick === undefined ? 'No pick' : teamNameOf(context, pick.teamId)
                        const source = pick === undefined || pick.source === 'player' ? '' : ' (auto)'
                        return (
                            <li key={entryId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                                <span>
                                    <strong>{context.nameOf(entryId)}</strong> · {team}{source}
                                </span>
                                <span className="text-muted">{outcomeLabel(entryWeek.outcome, entryWeek.reason, entryWeek.reinstated)}</span>
                                <div className="w-full sm:w-auto">
                                    <ActionPanel label="Override this player">
                                        <form action={overridePickAction.bind(null, entryId, week.id)} className="space-y-2">
                                            <label className="block space-y-1 text-sm">
                                                <span className="font-semibold">Outcome</span>
                                                <select name="outcome" required className="min-h-10 w-full rounded-lg border border-line px-2">
                                                    <option value="through">Through</option>
                                                    <option value="out">Out</option>
                                                    <option value="clear">Clear the override</option>
                                                </select>
                                            </label>
                                            <ReasonField />
                                            <Submit>Save</Submit>
                                        </form>
                                    </ActionPanel>
                                </div>
                            </li>
                        )
                    })}
                </ul>
            </Card>
        </>
    )
}

function feedLabel(row: {
    readonly state: string
    readonly homeGoals: number | null
    readonly awayGoals: number | null
}): string {
    switch (row.state) {
        case 'finished':
            return `${row.homeGoals ?? '?'}–${row.awayGoals ?? '?'}`
        case 'postponed':
            return 'postponed'
        case 'abandoned':
            return 'abandoned'
        default:
            return 'not played'
    }
}

function outcomeLabel(outcome: string, reason: string, reinstated: boolean): string {
    if (reinstated) {
        return 'Everyone went out, all stayed in'
    }

    switch (reason) {
        case 'pickOverride':
            return outcome === 'through' ? 'Through (admin)' : 'Out (admin)'
        case 'awaitingCutoff':
            return 'Before the cut-off'
        case 'awaitingPick':
            return 'No valid pick yet'
        case 'awaitingResult':
            return 'Waiting for the result'
        case 'pass':
            return 'Pass (no team left)'
        case 'void':
            return 'Through (void match)'
        default:
            return outcome === 'through' ? 'Through' : 'Out'
    }
}
