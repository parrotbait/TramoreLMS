// Created by Claude driven by Eddie Long on 2026-10-31.
//
// The database connection. Server only. One pool per process, reused across
// hot reloads in development.

import { drizzle } from 'drizzle-orm/postgres-js'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

export type Database = PostgresJsDatabase<typeof schema>

const globalStore = globalThis as typeof globalThis & { lmsDatabase?: { client: postgres.Sql; db: Database } }

export function getDatabase(): Database {
    if (globalStore.lmsDatabase !== undefined) {
        return globalStore.lmsDatabase.db
    }

    const url = process.env['POSTGRES_URL']
    if (url === undefined || url === '') {
        throw new Error('POSTGRES_URL is not set. Add it to .env.local.')
    }

    const client = postgres(url, { max: 5, prepare: false })
    const db = drizzle(client, { schema })
    globalStore.lmsDatabase = { client, db }

    return db
}

/** For scripts: closes the pool so the process can exit. */
export async function closeDatabase() {
    await globalStore.lmsDatabase?.client.end()
    delete globalStore.lmsDatabase
}
