// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Runs one tick against the local database, as the scheduler would.
//
//   pnpm tick                                   now, with the live feeds
//   pnpm tick --no-feed                         skip the feeds
//   pnpm tick --now 2026-11-21T11:31:00Z        pretend it is a given time
//
// --now is for testing locks and cut-offs on your machine. It refuses to run
// against a database that is not on this machine. Reminder emails go through
// EMAIL_TRANSPORT, which prints them in the terminal by default.

import { existsSync } from 'node:fs'
import { parseArgs } from 'node:util'

import { closeDatabase, getDatabase } from '@/db/client'
import { mailerFromEnv } from '@/email/mailer'
import { sendAlertEmails } from '@/jobs/alert-emails'
import { liveFeeds } from '@/jobs/live-feeds'
import { reconcilePayments } from '@/jobs/reconcile-payments'
import { sendReminders } from '@/jobs/send-reminders'
import { runTick } from '@/jobs/tick'
import { formatDublin } from '@/lib/format'

const { values } = parseArgs({
    options: {
        'now': { type: 'string' },
        'no-feed': { type: 'boolean', default: false },
    },
})

async function main(): Promise<number> {
    if (existsSync('.env.local')) {
        process.loadEnvFile('.env.local')
    }

    const host = new URL(process.env['POSTGRES_URL'] ?? 'postgres://localhost').hostname
    if (!['', 'localhost', '127.0.0.1', '::1'].includes(host)) {
        console.error('pnpm tick only runs against a local database.')
        return 1
    }

    const now = values.now === undefined ? new Date() : new Date(values.now)
    if (Number.isNaN(now.getTime())) {
        console.error(`Not a date: ${values.now ?? ''}`)
        return 1
    }

    const token = process.env['FOOTBALL_DATA_TOKEN'] ?? ''
    const feeds = values['no-feed'] || token === '' ? null : liveFeeds(token)
    const payments = values['no-feed'] ? null : await reconcilePayments(getDatabase(), now)
    const reports = await runTick(getDatabase(), now, feeds)
    const site = process.env['SITE_URL'] ?? 'http://localhost:3000'
    const reminders = await sendReminders(getDatabase(), mailerFromEnv(), now, site)
    const alertsEmailed = await sendAlertEmails(getDatabase(), mailerFromEnv(), now, site, process.env['ADMIN_EMAILS'])

    console.log(`Tick at ${formatDublin(now)} (${now.toISOString()})`)
    if (payments !== null) {
        const { checked, confirmed, failed, feesFilled, errors } = payments
        console.log(`  Payments: checked ${checked}, confirmed ${confirmed}, closed ${failed}, fees filled ${feesFilled}, errors ${errors}`)
    }
    console.log(`  Reminders: sent ${reminders.sent}, failed ${reminders.failed}, waiting ${reminders.waiting}`)
    console.log(`  Alerts emailed to admins: ${alertsEmailed}`)
    if (reports.length === 0) {
        console.log('  No open or running competitions. Set one to open first, for example with pnpm db:seed --status open.')
    }

    for (const report of reports) {
        const feed = typeof report.feed === 'string' ? report.feed : `failed: ${report.feed.error}`
        console.log(`  Competition ${report.competitionId}`)
        console.log(`    Feed: ${feed}, ${report.fixtureChanges} fixture changes`)
        console.log(`    Opened weeks: ${report.openedWeeks.join(', ') || 'none'}`)
        console.log(`    Auto-assigned picks: ${report.autoPicks}`)
        console.log(`    Settled weeks: ${report.settledWeeks.join(', ') || 'none'}`)
        console.log(`    Status: ${report.status}`)
        console.log(`    New alerts: ${report.newAlerts}`)
    }

    return 0
}

main()
    .then((code) => {
        process.exitCode = code
    })
    .catch((error: unknown) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(async () => {
        await closeDatabase()
    })
