// Created by Claude driven by Eddie Long on 2026-11-16.
//
// A real Postgres for tests, so money and entry rules run against the real
// tables, constraints and triggers. Each test file gets its own throwaway
// database, made from the real migrations and dropped afterwards.
//
// It never reads POSTGRES_URL, so it cannot touch the dev or live data.
// It needs a Postgres server it can create databases on. Homebrew
// postgresql@16 on the default port works. Point it elsewhere with
// TEST_POSTGRES_ADMIN_URL, for example postgres://user@localhost:5432/postgres.

import { randomUUID } from 'node:crypto'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import type { Database } from '@/db/client'
import * as schema from '@/db/schema'

const DEFAULT_ADMIN_URL = 'postgres://localhost:5432/postgres'
const NAME_PREFIX = 'lms_test_'

export interface TestDatabase {
    readonly db: Database
    /** Empties every table, so each test starts clean. */
    readonly reset: () => Promise<void>
    /** Runs one SQL statement and returns its rows. For checks that look at the database itself. */
    readonly rawQuery: (statement: string) => Promise<readonly Record<string, unknown>[]>
    /** Closes the connections and drops the database. */
    readonly close: () => Promise<void>
}

export async function createTestDatabase(): Promise<TestDatabase> {
    const adminUrl = process.env['TEST_POSTGRES_ADMIN_URL'] ?? DEFAULT_ADMIN_URL
    const admin = postgres(adminUrl, { max: 1, connect_timeout: 5, onnotice: () => {} })
    const name = `${NAME_PREFIX}${randomUUID().replaceAll('-', '').slice(0, 12)}`

    try {
        await admin.unsafe(`create database "${name}"`)
    } catch (error) {
        await admin.end()
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(
            `The database tests need a Postgres server they can create databases on (tried ${adminUrl}). `
            + `Start Postgres, or set TEST_POSTGRES_ADMIN_URL. ${reason}`,
        )
    }

    const url = new URL(adminUrl)
    url.pathname = `/${name}`
    const client = postgres(url.toString(), { max: 5, prepare: false, onnotice: () => {} })
    const db = drizzle(client, { schema })

    try {
        await migrate(db, { migrationsFolder: 'src/db/migrations' })
    } catch (error) {
        await client.end()
        await admin.unsafe(`drop database if exists "${name}" with (force)`)
        await admin.end()
        throw error
    }

    return {
        db,
        reset: async () => {
            await client.unsafe('truncate table "competition", "person", "audit_log" restart identity cascade')
        },
        rawQuery: async (statement) => {
            return client.unsafe(statement)
        },
        close: async () => {
            await client.end()
            if (name.startsWith(NAME_PREFIX)) {
                await admin.unsafe(`drop database if exists "${name}" with (force)`)
            }

            await admin.end()
        },
    }
}
