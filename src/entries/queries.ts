// Created by Claude driven by Eddie Long on 2026-11-01.
//
// A person's entries, newest competition first. Finished competitions are
// included, so a player can still see the final standings and the winner.

import { desc, eq } from 'drizzle-orm'

import type { Database } from '@/db/client'
import { competitions, entries } from '@/db/schema'

import type { MyEntry } from './gate'

export async function entriesForPerson(db: Database, personId: string): Promise<readonly MyEntry[]> {
    return db
        .select({
            entryId: entries.id,
            competitionId: competitions.id,
            competitionName: competitions.name,
            displayName: entries.displayName,
            status: entries.status,
            holdExpiresAt: entries.holdExpiresAt,
            entryFeeCents: competitions.entryFeeCents,
        })
        .from(entries)
        .innerJoin(competitions, eq(competitions.id, entries.competitionId))
        .where(eq(entries.personId, personId))
        .orderBy(desc(competitions.createdAt), entries.createdAt)
}
