// Created by Claude driven by Eddie Long on 2026-10-31.
// Changed by Claude driven by Eddie Long on 2026-11-22: each step is on its own, with a time budget.
//
// The scheduled tick. cron-job.org calls this every 10 minutes, and Vercel
// Cron calls it once a day as a backup (Decision 13). Both send
// `Authorization: Bearer <CRON_SECRET>`.
//
// The step that matters most comes first and stands alone: syncing results,
// opening and locking weeks, auto-picking, settling. Everything after it
// (payment checks, reminders, removing old emails, alert emails) is wrapped, so
// one slow or broken step can never stop the cut-off from being applied. Each
// later step has a share of the 60 seconds, and a step that runs out leaves
// the rest for the next tick. If any step fails the answer is a 500, so
// cron-job.org shows the run as failed.

import { siteUrl } from '@/auth/session'
import { getDatabase } from '@/db/client'
import { mailerFromEnv } from '@/email/mailer'
import { sendAlertEmails } from '@/jobs/alert-emails'
import { isAuthorisedCron } from '@/jobs/cron-auth'
import { liveFeeds } from '@/jobs/live-feeds'
import { reconcilePayments } from '@/jobs/reconcile-payments'
import { removeExpiredEmails } from '@/jobs/retention'
import { sendReminders } from '@/jobs/send-reminders'
import { runTickSafely } from '@/jobs/tick'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Of the 60 seconds, payment checks may use until this point, and reminders until the next. */
const PAYMENTS_BUDGET_MS = 30_000
const REMINDERS_BUDGET_MS = 45_000

export async function GET(request: Request): Promise<Response> {
    return handle(request)
}

export async function POST(request: Request): Promise<Response> {
    return handle(request)
}

/** Runs one step. A step that throws is recorded, and the next step still runs. */
async function step<T>(name: string, problems: string[], run: () => Promise<T>): Promise<T | null> {
    try {
        return await run()
    } catch (error) {
        console.error(`Tick step “${name}” failed:`, error)
        problems.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
        return null
    }
}

async function handle(request: Request): Promise<Response> {
    if (!isAuthorisedCron(request)) {
        return new Response('Unauthorised', { status: 401 })
    }

    const startedAt = Date.now()
    const db = getDatabase()
    const now = new Date()
    const problems: string[] = []

    const token = process.env['FOOTBALL_DATA_TOKEN'] ?? ''
    const feeds = token === '' ? null : liveFeeds(token)
    const adminEmails = process.env['ADMIN_EMAILS']

    // 1. The cut-off and the results. Nothing below may get in its way.
    const tick = await step('tick', problems, () => {
        return runTickSafely(db, now, feeds)
    })
    for (const failure of tick?.failures ?? []) {
        problems.push(`tick, competition ${failure.competitionId}: ${failure.message}`)
    }

    // 2. A payment that Stripe confirmed but the webhook missed.
    const payments = await step('payments', problems, () => {
        return reconcilePayments(db, now, startedAt + PAYMENTS_BUDGET_MS)
    })

    // A payment confirmed just now: lock and pick for that player in this run, not the next.
    const confirmedAgain = (payments?.confirmed ?? 0) > 0
        ? await step('tick after payments', problems, () => {
            return runTickSafely(db, now, null)
        })
        : null

    // 3. Emails. Without a working mail setup the email steps are skipped, and the problem is reported.
    const mailer = await step('email setup', problems, async () => {
        return mailerFromEnv()
    })
    const reminders = mailer === null
        ? null
        : await step('reminders', problems, () => {
            return sendReminders(db, mailer, now, siteUrl(), startedAt + REMINDERS_BUDGET_MS)
        })
    const emailsRemoved = await step('retention', problems, () => {
        return removeExpiredEmails(db, now, adminEmails)
    })
    const alertsEmailed = mailer === null
        ? null
        : await step('alert emails', problems, () => {
            return sendAlertEmails(db, mailer, now, siteUrl(), adminEmails)
        })

    return Response.json({
        ok: problems.length === 0,
        problems,
        ranAt: now.toISOString(),
        tookMs: Date.now() - startedAt,
        payments,
        reports: [...tick?.reports ?? [], ...confirmedAgain?.reports ?? []],
        reminders,
        emailsRemoved,
        alertsEmailed,
    }, { status: problems.length === 0 ? 200 : 500 })
}
