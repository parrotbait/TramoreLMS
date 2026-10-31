// Created by Claude driven by Eddie Long on 2026-10-31.

import { existsSync } from 'node:fs'

import { defineConfig } from 'drizzle-kit'

if (existsSync('.env.local')) {
    process.loadEnvFile('.env.local')
}

export default defineConfig({
    schema: './src/db/schema.ts',
    out: './src/db/migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env['POSTGRES_URL'] ?? 'postgres://localhost:5432/lastmanstanding',
    },
    strict: true,
    verbose: true,
})
