// Created by Claude driven by Eddie Long on 2026-11-04.
//
// The audit log (Decision 7b). Newest first.

import { desc } from 'drizzle-orm'

import { Card } from '@/components/admin/ui'
import { getDatabase } from '@/db/client'
import { auditLog } from '@/db/schema'
import { formatDublin } from '@/lib/format'

export default async function AuditPage() {
    const entries = await getDatabase().select().from(auditLog).orderBy(desc(auditLog.at)).limit(200)

    return (
        <Card title="Audit log">
            {entries.length === 0
                ? <p className="text-sm text-muted">No admin changes yet.</p>
                : (
                    <ul className="divide-y divide-line text-sm">
                        {entries.map((entry) => {
                            return (
                                <li key={entry.id} className="space-y-1 py-2">
                                    <p>
                                        <strong>{entry.action}</strong>
                                        <span className="text-muted"> · {entry.targetType} {entry.targetId.slice(0, 8)}</span>
                                    </p>
                                    <p>“{entry.reason}”</p>
                                    <p className="text-xs text-muted">
                                        {entry.actorEmail} · {formatDublin(entry.at)}
                                    </p>
                                    {entry.before === null && entry.after === null
                                        ? null
                                        : (
                                            <pre className="overflow-x-auto rounded bg-subtle px-2 py-1 text-xs">
                                                {JSON.stringify({ before: entry.before, after: entry.after })}
                                            </pre>
                                        )}
                                </li>
                            )
                        })}
                    </ul>
                )}
        </Card>
    )
}
