// Created by Claude driven by Eddie Long on 2026-11-04.
//
// A competition at a glance: where the week stands, what needs attention,
// and the money.

import Link from 'next/link'

import { loadAdminCompetition } from '@/admin/load'
import { CompetitionNav } from '@/components/admin/CompetitionNav'
import { Card, Stat } from '@/components/admin/ui'
import { formatDublin, formatEuro } from '@/lib/format'

interface DashboardProps {
    readonly params: Promise<{ readonly id: string }>
}

export default async function CompetitionDashboard({ params }: DashboardProps) {
    const { id } = await params
    const data = await loadAdminCompetition(id)
    const { rows, standings, money, currentWeek } = data
    const now = data.context.now

    const statuses = [...standings.entries.values()]
    const stillIn = statuses.filter((standing) => {
        return standing.status === 'in' || standing.status === 'winner' || standing.status === 'provisionallyOut'
    }).length
    const week = currentWeek === null
        ? undefined
        : rows.weeks.find((candidate) => {
            return candidate.number === currentWeek
        })
    const weekPicks = week === undefined
        ? 0
        : rows.picks.filter((pick) => {
            return pick.weekId === week.id
        }).length
    const pending = rows.entries.filter((entry) => {
        return entry.status === 'pending'
    }).length

    return (
        <>
            <CompetitionNav competitionId={id} name={rows.competition.name} currentWeek={currentWeek} />

            <Card title="This week">
                <div className="grid gap-2 sm:grid-cols-4">
                    <Stat label="Status" value={rows.competition.status} detail={rows.competition.entriesOpen ? 'Entries open' : 'Entries closed'} />
                    <Stat
                        label={week === undefined ? 'Week' : `Week ${week.number} · PL Matchday ${week.plMatchday}`}
                        value={week?.cutoffAt === null || week === undefined ? 'Not open' : formatDublin(week.cutoffAt)}
                        detail={week?.cutoffAt !== null && week !== undefined && week.cutoffAt.getTime() <= now.getTime() ? 'Locked' : 'Cut-off'}
                    />
                    <Stat label="Picks made this week" value={String(weekPicks)} detail={`${stillIn} players in`} />
                    <Stat
                        label="Open alerts"
                        value={String(data.openAlerts)}
                        detail={data.openAlerts > 0 ? 'Needs your attention' : 'Nothing to do'}
                    />
                </div>
                {data.openAlerts > 0
                    ? <Link href="/admin/alerts" className="text-sm font-semibold text-maroon underline">Go to the alerts</Link>
                    : null}
            </Card>

            <Card title="Money">
                <div className="grid gap-2 sm:grid-cols-4">
                    <Stat label="Entries paid" value={formatEuro(money.entryCents)} detail={`${money.entryCount} entries`} />
                    <Stat label="Buy-backs paid" value={formatEuro(money.buybackCents)} detail={`${money.buybackCount} buy-backs`} />
                    <Stat label="Stripe fees" value={formatEuro(money.feesCents)} detail={`Refunded ${formatEuro(money.refundedCents)}`} />
                    <Stat label="Raised for the club" value={formatEuro(money.netRaisedCents)} detail={`After the ${formatEuro(money.prizeCents)} prize`} />
                </div>
                <p className="text-xs text-muted">
                    By method: Stripe {formatEuro(money.byMethod.stripe)}, cash {formatEuro(money.byMethod.cash)},
                    Revolut {formatEuro(money.byMethod.revolut)}, other {formatEuro(money.byMethod.other)}.
                    {pending > 0 ? ` ${pending} entries are waiting for payment.` : ''}
                </p>
                <a href={`/admin/c/${id}/payments.csv`} className="text-sm font-semibold text-maroon underline">Download payments (CSV)</a>
            </Card>

            <Card title="Weeks">
                <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    {[...rows.weeks].sort((left, right) => {
                        return left.number - right.number
                    }).map((candidate) => {
                        const state = candidate.settledAt !== null
                            ? 'settled'
                            : candidate.cutoffAt === null
                                ? 'not open'
                                : candidate.cutoffAt.getTime() <= now.getTime()
                                    ? 'locked'
                                    : `cut-off ${formatDublin(candidate.cutoffAt)}`
                        return (
                            <li key={candidate.id}>
                                <Link href={`/admin/c/${id}/weeks/${candidate.number}`} className="font-semibold text-maroon underline">
                                    Week {candidate.number}
                                </Link>
                                <span className="text-muted"> · MD{candidate.plMatchday} · {state}</span>
                            </li>
                        )
                    })}
                </ul>
            </Card>
        </>
    )
}
