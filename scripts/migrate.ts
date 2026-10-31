// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Applies pending migrations from src/db/migrations.
//
//   pnpm db:migrate
//
// Used instead of `drizzle-kit migrate` because that hides the error when a
// migration fails.

import { existsSync } from 'node:fs'

import { migrate } from 'drizzle-orm/postgres-js/migrator'

import { closeDatabase, getDatabase } from '@/db/client'

async function main() {
    if (existsSync('.env.local')) {
        process.loadEnvFile('.env.local')
    }

    await migrate(getDatabase(), { migrationsFolder: 'src/db/migrations' })
    console.log('Migrations applied.')
}

main()
    .catch((error: unknown) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(async () => {
        await closeDatabase()
    })
