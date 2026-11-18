// Created by Claude driven by Eddie Long on 2026-10-31.
//
// The scheduled tick. cron-job.org calls this every 10 minutes, and Vercel
// Cron calls it once a day as a backup (Decision 13). Both send
// `Authorization: Bearer <CRON_SECRET>`.

import { siteUrl } from '@/auth/session'
import { getDatabase } from '@/db/client'
import { mailerFromEnv } from '@/email/mailer'
import { sendAlertEmails } from '@/jobs/alert-emails'
import { isAuthorisedCron } from '@/jobs/cron-auth'
import { liveFeeds } from '@/jobs/live-feeds'
import { reconcilePayments } from '@/jobs/reconcile-payments'
import { removeExpiredEmails } from '@/jobs/retention'
import { sendReminders } from '@/jobs/send-reminders'
import { runTick } from '@/jobs/tick'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request): Promise<Response> {
    return handle(request)
}

export async function POST(request: Request): Promise<Response> {
    return handle(request)
}

async function handle(request: Request): Promise<Response> {
    if (!isAuthorisedCron(request)) {
        return new Response('Unauthorised', { status: 401 })
    }

    const db = getDatabase()
    const now = new Date()
    const payments = await reconcilePayments(db, now)

    const token = process.env['FOOTBALL_DATA_TOKEN'] ?? ''
    const feeds = token === '' ? null : liveFeeds(token)
    const reports = await runTick(db, now, feeds)
    const mailer = mailerFromEnv()
    const adminEmails = process.env['ADMIN_EMAILS']
    const reminders = await sendReminders(db, mailer, now, siteUrl())
    const emailsRemoved = await removeExpiredEmails(db, now, adminEmails)
    const alertsEmailed = await sendAlertEmails(db, mailer, now, siteUrl(), adminEmails)

    return Response.json({ ranAt: now.toISOString(), payments, reports, reminders, emailsRemoved, alertsEmailed })
}
