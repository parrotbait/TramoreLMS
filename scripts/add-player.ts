// Created by Claude driven by Eddie Long on 2026-11-01.
//
// Adds a player to the newest open or running competition in the local
// database, so you can sign in as them. Paid by default.
//
//   pnpm dev:add-player --email you@example.com --name "Eddie L"
//   pnpm dev:add-player ... --pending    unpaid, with a 1-hour name hold

import { existsSync } from 'node:fs'
import { parseArgs } from 'node:util'

import { desc, inArray } from 'drizzle-orm'

import { normaliseEmail } from '@/auth/rules'
import { closeDatabase, getDatabase } from '@/db/client'
import { competitions, entries, payments, people } from '@/db/schema'
import { displayNameKey } from '@/lib/display-name'

const { values } = parseArgs({
    options: {
        email: { type: 'string' },
        name: { type: 'string' },
        pending: { type: 'boolean', default: false },
    },
})

async function main(): Promise<number> {
    if (existsSync('.env.local')) {
        process.loadEnvFile('.env.local')
    }

    const host = new URL(process.env['POSTGRES_URL'] ?? 'postgres://localhost').hostname
    if (!['', 'localhost', '127.0.0.1', '::1'].includes(host)) {
        console.error('dev:add-player only runs against a local database.')
        return 1
    }

    const email = normaliseEmail(values.email ?? '')
    const name = (values.name ?? '').trim()
    if (email === null || name === '' || name.length > 20) {
        console.error('Usage: pnpm dev:add-player --email you@example.com --name "Eddie L" (name up to 20 characters)')
        return 1
    }

    const db = getDatabase()
    const [competition] = await db
        .select({ id: competitions.id, name: competitions.name })
        .from(competitions)
        .where(inArray(competitions.status, ['open', 'running']))
        .orderBy(desc(competitions.createdAt))
        .limit(1)
    if (competition === undefined) {
        console.error('No open or running competition. Run pnpm db:seed --status open first.')
        return 1
    }

    await db.transaction(async (tx) => {
        await tx.insert(people).values({ email }).onConflictDoNothing()
        const [person] = await tx.select({ id: people.id }).from(people).where(inArray(people.email, [email]))
        if (person === undefined) {
            throw new Error('Could not create the person.')
        }

        const [entry] = await tx.insert(entries).values({
            competitionId: competition.id,
            personId: person.id,
            displayName: name,
            displayNameKey: displayNameKey(name),
            status: values.pending ? 'pending' : 'active',
            holdExpiresAt: values.pending ? new Date(Date.now() + 60 * 60 * 1000) : null,
        }).returning({ id: entries.id })
        if (entry === undefined) {
            throw new Error('Could not create the entry.')
        }

        if (values.pending) {
            return
        }

        await tx.insert(payments).values({
            entryId: entry.id,
            kind: 'entry',
            method: 'cash',
            status: 'paid',
            amountCents: 1000,
            note: 'Added with pnpm dev:add-player',
        })
    })

    const state = values.pending ? 'an unpaid entry' : 'a paid entry'
    console.log(`Added ${state} “${name}” <${email}> to ${competition.name}. Sign in at http://localhost:3000/signin`)
    return 0
}

main()
    .then((code) => {
        process.exitCode = code
    })
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
    })
    .finally(async () => {
        await closeDatabase()
    })
