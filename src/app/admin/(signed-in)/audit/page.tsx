// Created by Claude driven by Eddie Long on 2026-11-04.
//
// The audit log (Decision 7b). Newest first. Each row says what was changed in
// words, not just an id: the player and competition, the teams in a fixture,
// the week. The labels are looked up now, so they show current names.

import { desc, inArray } from 'drizzle-orm'

import { Card } from '@/components/admin/ui'
import { getDatabase } from '@/db/client'
import {
    alerts,
    auditLog,
    competitions,
    entries,
    fixtures,
    teams,
    weeks,
} from '@/db/schema'
import { formatDublin } from '@/lib/format'

type AuditRow = typeof auditLog.$inferSelect

export default async function AuditPage() {
    const db = getDatabase()
    const rows = await db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(200)
    const labels = await describeTargets(rows)

    return (
        <Card title="Audit log">
            {rows.length === 0
                ? <p className="text-sm text-muted">No admin changes yet.</p>
                : (
                    <ul className="divide-y divide-line text-sm">
                        {rows.map((row) => {
                            const label = labels.get(targetKey(row.targetType, row.targetId))
                            return (
                                <li key={row.id} className="space-y-1 py-3">
                                    <p>
                                        <strong>{row.action}</strong>
                                        <span className="text-muted"> · {row.targetType}</span>
                                    </p>
                                    {label === undefined || label.length === 0
                                        ? null
                                        : (
                                            <ul className="text-sm">
                                                {label.map((line) => {
                                                    return <li key={line}>{line}</li>
                                                })}
                                            </ul>
                                        )}
                                    <p className="break-all text-xs text-muted">id {row.targetId}</p>
                                    <p>“{row.reason}”</p>
                                    <p className="text-xs text-muted">
                                        {row.actorEmail} · {formatDublin(row.at)}
                                    </p>
                                    {row.before === null
                                        ? null
                                        : <Details title="Before" value={row.before} />}
                                    {row.after === null
                                        ? null
                                        : <Details title="After" value={row.after} />}
                                </li>
                            )
                        })}
                    </ul>
                )}
        </Card>
    )
}

function Details({ title, value }: { readonly title: string; readonly value: unknown }) {
    return (
        <div>
            <p className="text-xs font-semibold text-muted">{title}</p>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-subtle px-2 py-1 text-xs">
                {JSON.stringify(value, null, 2)}
            </pre>
        </div>
    )
}

function targetKey(type: string, id: string): string {
    return `${type}:${id}`
}

/**
 * One or more plain lines for each target. A target that is gone (a deleted
 * competition, for example) has no label. Its before and after still say what it was.
 */
async function describeTargets(rows: readonly AuditRow[]): Promise<ReadonlyMap<string, readonly string[]>> {
    const db = getDatabase()
    const idsOf = (type: string) => {
        return [...new Set(rows.filter((row) => {
            return row.targetType === type && isUuid(row.targetId)
        }).map((row) => {
            return row.targetId
        }))]
    }
    const result = new Map<string, readonly string[]>()

    const competitionRows = await db.select({ id: competitions.id, name: competitions.name }).from(competitions)
    const competitionName = new Map(competitionRows.map((row) => {
        return [row.id, row.name] as const
    }))
    for (const id of idsOf('competition')) {
        const name = competitionName.get(id)
        if (name !== undefined) {
            result.set(targetKey('competition', id), [`Competition: ${name}`])
        }
    }

    const entryIds = idsOf('entry')
    const personIds = idsOf('person')
    const entryRows = entryIds.length === 0 && personIds.length === 0
        ? []
        : await db.select().from(entries)
    for (const id of entryIds) {
        const entry = entryRows.find((row) => {
            return row.id === id
        })
        if (entry !== undefined) {
            result.set(targetKey('entry', id), [
                `Player: ${entry.displayName} (${entry.status})`,
                `Competition: ${competitionName.get(entry.competitionId) ?? 'unknown'}`,
            ])
        }
    }

    for (const id of personIds) {
        const theirs = entryRows.filter((row) => {
            return row.personId === id
        })
        result.set(targetKey('person', id), theirs.map((entry) => {
            return `Entry: ${entry.displayName} (${entry.status}) in ${competitionName.get(entry.competitionId) ?? 'unknown'}`
        }))
    }

    const weekIds = idsOf('week')
    if (weekIds.length > 0) {
        const weekRows = await db.select().from(weeks).where(inArray(weeks.id, weekIds))
        for (const week of weekRows) {
            result.set(targetKey('week', week.id), [
                `Week ${week.number} (PL Matchday ${week.plMatchday})`,
                `Competition: ${competitionName.get(week.competitionId) ?? 'unknown'}`,
            ])
        }
    }

    const fixtureIds = idsOf('fixture')
    if (fixtureIds.length > 0) {
        const fixtureRows = await db.select().from(fixtures).where(inArray(fixtures.id, fixtureIds))
        const teamRows = await db.select({ id: teams.id, name: teams.fullName }).from(teams)
        const teamName = new Map(teamRows.map((row) => {
            return [row.id, row.name] as const
        }))
        const weekNumbers = new Map((await db.select({ id: weeks.id, number: weeks.number }).from(weeks)).map((row) => {
            return [row.id, row.number] as const
        }))
        for (const fixture of fixtureRows) {
            result.set(targetKey('fixture', fixture.id), [
                `${teamName.get(fixture.homeTeamId) ?? '?'} v ${teamName.get(fixture.awayTeamId) ?? '?'}`,
                `Week ${weekNumbers.get(fixture.weekId) ?? '?'} · ${formatDublin(fixture.kickoffAt)}`,
                `Competition: ${competitionName.get(fixture.competitionId) ?? 'unknown'}`,
            ])
        }
    }

    const alertIds = idsOf('alert')
    if (alertIds.length > 0) {
        const alertRows = await db.select().from(alerts).where(inArray(alerts.id, alertIds))
        for (const alert of alertRows) {
            result.set(targetKey('alert', alert.id), [
                `Alert: ${alert.kind}`,
                alert.message,
                `Competition: ${competitionName.get(alert.competitionId) ?? 'unknown'}`,
            ])
        }
    }

    return result
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
