// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Emails the admins about new alerts (PLAN.md section 6). The scheduled tick
// calls this last, so alerts from the payment checks, the feed sync and the
// tick all go in one email.
//
// Alerts are claimed by setting emailed_at before the email goes, so two
// ticks at once can't send the same alert twice. If sending fails, the
// claim is removed and the next tick tries again. Alerts resolved before
// they were emailed are skipped, and so are demo alerts.

import { and, inArray, isNull, sql } from 'drizzle-orm'

import { parseAdminEmails } from '@/auth/rules'
import type { Database } from '@/db/client'
import { alerts, competitions } from '@/db/schema'
import type { Mailer } from '@/email/mailer'
import { alertEmail } from '@/email/templates'

/** Returns how many alerts were emailed. */
export async function sendAlertEmails(
    db: Database,
    mailer: Mailer,
    now: Date,
    siteUrl: string,
    adminEmails: string | undefined,
): Promise<number> {
    const recipients = [...parseAdminEmails(adminEmails)]
    if (recipients.length === 0) {
        return 0
    }

    const claimed = await db.update(alerts)
        .set({ emailedAt: now })
        .where(and(
            isNull(alerts.emailedAt),
            isNull(alerts.resolvedAt),
            sql`${alerts.competitionId} in (select ${competitions.id} from ${competitions} where not ${competitions.isDemo})`,
        ))
        .returning({
            id: alerts.id,
            competitionId: alerts.competitionId,
            message: alerts.message,
            createdAt: alerts.createdAt,
        })
    if (claimed.length === 0) {
        return 0
    }

    try {
        const names = await db
            .select({ id: competitions.id, name: competitions.name })
            .from(competitions)
            .where(inArray(competitions.id, [...new Set(claimed.map((alert) => {
                return alert.competitionId
            }))]))
        const nameOf = new Map(names.map((row) => {
            return [row.id, row.name] as const
        }))
        const lines = [...claimed]
            .sort((left, right) => {
                return left.createdAt.getTime() - right.createdAt.getTime()
            })
            .map((alert) => {
                return { competitionName: nameOf.get(alert.competitionId) ?? 'Competition', message: alert.message }
            })

        await mailer.send({
            to: recipients.join(', '),
            ...alertEmail(new URL('/admin/alerts', siteUrl).toString(), lines),
        })
    } catch (error) {
        console.error('Alert email failed', error)
        await db.update(alerts)
            .set({ emailedAt: null })
            .where(inArray(alerts.id, claimed.map((alert) => {
                return alert.id
            })))

        return 0
    }

    return claimed.length
}
