// Created by Claude driven by Eddie Long on 2026-11-18.
//
// A backup of the whole database as one JSON snapshot, and the restore.
//
// Export reads every table inside one read-only transaction, so all tables
// come from the same instant. Each table is turned into JSON by Postgres
// itself (json_agg), and restored with json_populate_recordset, so every
// column type (uuid, enum, timestamp, jsonb) comes back exactly.
//
// Sign-in tokens (session, magic_link) are left out. They are not needed
// after a restore, and they are the most sensitive rows. People sign in again.
//
// Restore needs a database that is already migrated and empty. It refuses
// anything else, so it can never write over live data.

import { sql } from 'drizzle-orm'

import type { Database } from '@/db/client'

/** Parents before children, so a restore satisfies every foreign key. */
export const BACKUP_TABLES = [
    'person',
    'competition',
    'team',
    'week',
    'fixture',
    'entry',
    'payment',
    'pick',
    'pick_override',
    'email_sent',
    'alert',
    'audit_log',
] as const

/** Every table that is not backed up, on purpose. A test fails if a new table is in neither list. */
export const LEFT_OUT_TABLES = ['session', 'magic_link'] as const

export type BackupTable = (typeof BACKUP_TABLES)[number]

export interface BackupSnapshot {
    readonly format: 'lms-backup'
    readonly version: 1
    readonly createdAt: string
    /** How many migrations the database had. A restore needs the same number. */
    readonly migrations: number
    readonly counts: Readonly<Record<BackupTable, number>>
    readonly tables: Readonly<Record<BackupTable, readonly unknown[]>>
}

export async function exportSnapshot(db: Database, now: Date): Promise<BackupSnapshot> {
    return db.transaction(async (tx) => {
        const tables = {} as Record<BackupTable, readonly unknown[]>
        const counts = {} as Record<BackupTable, number>

        for (const table of BACKUP_TABLES) {
            const result = await tx.execute<{ rows: unknown[] }>(
                sql`select coalesce(json_agg(t), '[]'::json) as rows from ${sql.identifier(table)} t`,
            )
            const rows = result[0]?.rows ?? []
            tables[table] = rows
            counts[table] = rows.length
        }

        return {
            format: 'lms-backup',
            version: 1,
            createdAt: now.toISOString(),
            migrations: await migrationCount(tx),
            counts,
            tables,
        } satisfies BackupSnapshot
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}

/** Writes a snapshot into an empty, migrated database. Returns the rows written per table. */
export async function restoreSnapshot(
    db: Database,
    snapshot: BackupSnapshot,
): Promise<Readonly<Record<BackupTable, number>>> {
    if (snapshot.format !== 'lms-backup' || snapshot.version !== 1) {
        throw new Error('This is not a Last Man Standing backup this version can read.')
    }

    return db.transaction(async (tx) => {
        const current = await migrationCount(tx)
        if (current !== snapshot.migrations) {
            throw new Error(
                `The backup was made with ${snapshot.migrations} migrations, but this database has ${current}. `
                + 'Run pnpm db:migrate first, or restore into a database at the same version.',
            )
        }

        for (const table of BACKUP_TABLES) {
            const result = await tx.execute<{ found: boolean }>(
                sql`select exists (select 1 from ${sql.identifier(table)}) as found`,
            )
            if (result[0]?.found === true) {
                throw new Error(`The “${table}” table already has rows. Restore only into an empty database.`)
            }
        }

        const restored = {} as Record<BackupTable, number>
        for (const table of BACKUP_TABLES) {
            const rows = snapshot.tables[table] ?? []
            restored[table] = rows.length
            if (rows.length === 0) {
                continue
            }

            await tx.execute(sql`
                insert into ${sql.identifier(table)}
                select * from json_populate_recordset(null::${sql.identifier(table)}, ${JSON.stringify(rows)}::json)
            `)
        }

        // The audit log numbers its own rows. Move the counter past the restored ones.
        await tx.execute(sql`
            select setval(
                pg_get_serial_sequence('"audit_log"', 'id'),
                coalesce((select max(id) from "audit_log"), 1),
                (select max(id) is not null from "audit_log")
            )
        `)

        return restored
    })
}

async function migrationCount(tx: Pick<Database, 'execute'>): Promise<number> {
    const result = await tx.execute<{ total: number }>(
        sql`select count(*)::int as total from drizzle.__drizzle_migrations`,
    )
    return result[0]?.total ?? 0
}
