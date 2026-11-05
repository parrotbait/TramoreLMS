// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Removes the emails that isDueForRemoval picks out. The scheduled tick
// calls this. Each removal is one transaction, written to the audit log.
//
// Only the email goes. Names and picks stay in the results. This matches
// the privacy page. A full removal on request is done by an admin on the
// Entries page (removePersonAction), which also renames the entries.

import { and, eq, inArray, isNull, max } from 'drizzle-orm'

import { recordAudit } from '@/admin/audit'
import { parseAdminEmails } from '@/auth/rules'
import type { Database } from '@/db/client'
import { competitions, entries, magicLinks, people, sessions, weeks } from '@/db/schema'

import { isDueForRemoval } from './plan-retention'

export async function removeExpiredEmails(db: Database, now: Date, adminEmails: string | undefined): Promise<number> {
    const candidates = await db
        .select({ id: people.id, email: people.email })
        .from(people)
        .where(isNull(people.deletedAt))
    if (candidates.length === 0) {
        return 0
    }

    // Demo entries don't count. A guest's email follows their real entries only.
    const entryRows = await db
        .select({ personId: entries.personId, competitionId: entries.competitionId })
        .from(entries)
        .innerJoin(competitions, eq(competitions.id, entries.competitionId))
        .where(and(eq(competitions.isDemo, false), inArray(entries.personId, candidates.map((person) => {
            return person.id
        }))))
    const ends = await competitionEnds(db, [...new Set(entryRows.map((row) => {
        return row.competitionId
    }))])

    const admins = parseAdminEmails(adminEmails)
    const due = candidates.filter((person) => {
        const theirs = entryRows.filter((row) => {
            return row.personId === person.id
        })
        return isDueForRemoval({
            isAdmin: admins.has(person.email),
            competitionEnds: theirs.map((row) => {
                return ends.get(row.competitionId) ?? null
            }),
        }, now)
    })

    for (const person of due) {
        await db.transaction(async (tx) => {
            await tx.update(people).set({
                email: `removed-${person.id}@removed.invalid`,
                deletedAt: now,
            }).where(and(eq(people.id, person.id), isNull(people.deletedAt)))
            await tx.delete(sessions).where(eq(sessions.personId, person.id))
            await tx.delete(magicLinks).where(eq(magicLinks.personId, person.id))
            await recordAudit(tx, {
                actorEmail: 'system',
                action: 'person.retention',
                targetType: 'person',
                targetId: person.id,
                reason: 'Email removed after the competition ended (privacy policy).',
            })
        })
    }

    return due.length
}

/** When each finished competition ended: its last settled week. */
async function competitionEnds(db: Database, competitionIds: readonly string[]): Promise<ReadonlyMap<string, Date>> {
    if (competitionIds.length === 0) {
        return new Map()
    }

    const rows = await db
        .select({ id: competitions.id, endedAt: max(weeks.settledAt) })
        .from(competitions)
        .innerJoin(weeks, eq(weeks.competitionId, competitions.id))
        .where(and(inArray(competitions.id, [...competitionIds]), eq(competitions.status, 'finished')))
        .groupBy(competitions.id)

    return new Map(rows.flatMap((row) => {
        // new Date() as the driver may hand back a string for an aggregate.
        return row.endedAt === null ? [] : [[row.id, new Date(row.endedAt)] as const]
    }))
}
