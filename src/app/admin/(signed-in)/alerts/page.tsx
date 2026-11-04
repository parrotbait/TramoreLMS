// Created by Claude driven by Eddie Long on 2026-11-04.

import { desc, eq, isNotNull, isNull } from 'drizzle-orm'

import { resolveAlertAction } from '@/admin/actions'
import { ActionPanel, Card, Field, Submit } from '@/components/admin/ui'
import { getDatabase } from '@/db/client'
import { alerts, competitions } from '@/db/schema'
import { formatDublin } from '@/lib/format'

export default async function AlertsPage() {
    const db = getDatabase()
    const columns = {
        id: alerts.id,
        kind: alerts.kind,
        message: alerts.message,
        createdAt: alerts.createdAt,
        resolvedAt: alerts.resolvedAt,
        competition: competitions.name,
    }
    const [open, resolved] = await Promise.all([
        db.select(columns).from(alerts).innerJoin(competitions, eq(competitions.id, alerts.competitionId))
            .where(isNull(alerts.resolvedAt)).orderBy(desc(alerts.createdAt)),
        db.select(columns).from(alerts).innerJoin(competitions, eq(competitions.id, alerts.competitionId))
            .where(isNotNull(alerts.resolvedAt)).orderBy(desc(alerts.resolvedAt)).limit(30),
    ])

    return (
        <>
            <Card title={`Open alerts (${open.length})`}>
                {open.length === 0
                    ? <p className="text-sm text-muted">Nothing needs your attention.</p>
                    : (
                        <ul className="divide-y divide-line">
                            {open.map((alert) => {
                                return (
                                    <li key={alert.id} className="space-y-2 py-3">
                                        <p className="text-sm">{alert.message}</p>
                                        <p className="text-xs text-muted">{alert.competition} · {formatDublin(alert.createdAt)} · {alert.kind}</p>
                                        <ActionPanel label="Mark as resolved">
                                            <form action={resolveAlertAction.bind(null, alert.id)} className="space-y-2">
                                                <Field label="What you did (optional)" name="note" placeholder="Refunded the second payment" />
                                                <Submit>Resolve</Submit>
                                            </form>
                                        </ActionPanel>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
            </Card>

            <Card title="Recently resolved">
                {resolved.length === 0
                    ? <p className="text-sm text-muted">None yet.</p>
                    : (
                        <ul className="divide-y divide-line text-sm text-muted">
                            {resolved.map((alert) => {
                                return (
                                    <li key={alert.id} className="py-2">
                                        {alert.message}
                                        <span className="block text-xs">Resolved {alert.resolvedAt === null ? '' : formatDublin(alert.resolvedAt)}</span>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
            </Card>
        </>
    )
}
