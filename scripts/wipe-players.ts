// Created by Claude driven by Eddie Long on 2026-11-25.
//
// Removes every player, for clearing out test data. Keeps the competitions and the admins.
//
//   pnpm wipe-players                       a dry run: counts what would go, changes nothing
//   pnpm wipe-players --execute             really wipes, after you type WIPE
//   pnpm wipe-players --manual-are-tests    also allow cash and Revolut entries to go
//
// It reads POSTGRES_URL and ADMIN_EMAILS from .env.local. It refuses if any
// live Stripe payment exists. It prints the database host first, so you can
// see which database it is about to change.

import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'

import { parseAdminEmails } from '@/auth/rules'
import { closeDatabase, getDatabase } from '@/db/client'
import { wipePlayers } from '@/admin/wipe-players'

const { values } = parseArgs({
    options: {
        'execute': { type: 'boolean', default: false },
        'manual-are-tests': { type: 'boolean', default: false },
    },
})

async function main(): Promise<number> {
    if (existsSync('.env.local')) {
        process.loadEnvFile('.env.local')
    }

    const url = process.env['POSTGRES_URL']
    if (url === undefined || url === '') {
        console.error('POSTGRES_URL is not set. Put it in .env.local.')
        return 1
    }

    const keep = [...parseAdminEmails(process.env['ADMIN_EMAILS'])]
    if (keep.length === 0) {
        console.error('ADMIN_EMAILS is empty, so every person would be removed, admins too. Set it in .env.local first.')
        return 1
    }

    console.log(`Database: ${new URL(url).hostname}`)
    console.log(`Keeping ${keep.length} admin${keep.length === 1 ? '' : 's'}: ${keep.join(', ')}`)

    const options = {
        keepEmails: keep,
        manualPaymentsAreTests: values['manual-are-tests'],
        actorEmail: keep[0] ?? 'script',
    }
    const db = getDatabase()
    const preview = await wipePlayers(db, { ...options, execute: false })
    switch (preview.kind) {
        case 'liveMoney':
            console.error(`Stopped: ${preview.paymentCount} live Stripe payment(s) took real money. Nothing was changed.`)
            return 1
        case 'manualMoney':
            console.error(`Stopped: ${preview.paymentCount} cash/Revolut payment(s) were added by hand. If they were only tests, run again with --manual-are-tests.`)
            return 1
        case 'dryRun':
        case 'wiped':
            break
    }

    console.log(`This would remove ${preview.counts.people} people, ${preview.counts.entries} entries and ${preview.counts.payments} payments.`)
    if (!values.execute) {
        console.log('Dry run only. Nothing was changed. Add --execute to wipe.')
        return 0
    }

    const prompt = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await prompt.question('Type WIPE to remove them for good: ')
    prompt.close()
    if (answer.trim() !== 'WIPE') {
        console.log('Cancelled. Nothing was changed.')
        return 1
    }

    const result = await wipePlayers(db, { ...options, execute: true })
    if (result.kind === 'wiped') {
        console.log(`Done. Removed ${result.counts.people} people, ${result.counts.entries} entries, ${result.counts.payments} payments.`)
    }

    return 0
}

main().then(async (code) => {
    await closeDatabase()
    process.exit(code)
}, async (error: unknown) => {
    console.error(error)
    await closeDatabase()
    process.exit(1)
})
