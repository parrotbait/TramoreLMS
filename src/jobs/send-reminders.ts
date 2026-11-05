// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Sends the reminder emails that planReminders says are due. The scheduled
// tick calls this after runTick.
//
// Each email is claimed in email_sent before it goes, so two ticks at once
// can't send it twice. If sending fails, the claim is removed and the next
// tick tries again. One email per person per week, listing each of their
// entries that hasn't picked.
//
// Gmail SMTP takes about a second per email and the function has 60 seconds,
// so one run sends at most MAX_EMAILS_PER_RUN. The rest go on the next tick,
// 10 minutes later.

import { and, eq, inArray } from 'drizzle-orm'

import { createLink } from '@/auth/store'
import type { Database } from '@/db/client'
import { toGameState } from '@/db/game-state'
import { activeCompetitionIds, loadCompetitionRows } from '@/db/load'
import { emailsSent, people } from '@/db/schema'
import type { Mailer } from '@/email/mailer'
import { reminderEmail } from '@/email/templates'
import { computeStandings } from '@/engine'
import { formatDublin } from '@/lib/format'

import { planReminders, reminderKey } from './plan-reminders'
import type { ReminderDue } from './plan-reminders'

export const MAX_EMAILS_PER_RUN = 20
const REMINDER_KIND = 'reminder'

export interface ReminderReport {
    readonly sent: number
    readonly failed: number
    /** Due, but left for the next run. */
    readonly waiting: number
}

interface PersonReminder {
    readonly personId: string
    readonly weekId: string
    readonly weekNumber: number
    readonly plMatchday: number
    readonly cutoffAt: Date
    readonly entries: readonly { readonly id: string; readonly name: string }[]
}

interface Tally {
    sent: number
    failed: number
    waiting: number
}

export async function sendReminders(db: Database, mailer: Mailer, now: Date, siteUrl: string): Promise<ReminderReport> {
    const tally: Tally = { sent: 0, failed: 0, waiting: 0 }
    for (const competitionId of await activeCompetitionIds(db)) {
        await remindFor(db, mailer, competitionId, now, now, siteUrl, tally)
    }

    return tally
}

/**
 * One competition's reminders. A demo passes its own clock as `gameNow`.
 * Sign-in links and email_sent always use the real time, so a demo clock
 * ahead of real time can't upset the sign-in rate limit.
 */
export async function sendCompetitionReminders(
    db: Database,
    mailer: Mailer,
    competitionId: string,
    gameNow: Date,
    realNow: Date,
    siteUrl: string,
): Promise<ReminderReport> {
    const tally: Tally = { sent: 0, failed: 0, waiting: 0 }
    await remindFor(db, mailer, competitionId, gameNow, realNow, siteUrl, tally)

    return tally
}

async function remindFor(
    db: Database,
    mailer: Mailer,
    competitionId: string,
    gameNow: Date,
    realNow: Date,
    siteUrl: string,
    tally: Tally,
) {
    for (const reminder of await dueReminders(db, competitionId, gameNow)) {
        if (tally.sent + tally.failed >= MAX_EMAILS_PER_RUN) {
            tally.waiting += 1
            continue
        }

        const outcome = await sendOne(db, mailer, realNow, siteUrl, reminder)
        if (outcome === 'sent') {
            tally.sent += 1
        } else if (outcome === 'failed') {
            tally.failed += 1
        }
    }
}

async function dueReminders(db: Database, competitionId: string, now: Date): Promise<readonly PersonReminder[]> {
    const rows = await loadCompetitionRows(db, competitionId)
    if (rows.weeks.length === 0) {
        return []
    }

    const state = toGameState(rows)
    const weekNumberById = new Map(rows.weeks.map((week) => {
        return [week.id, week.number] as const
    }))
    const sentRows = await db
        .select({ entryId: emailsSent.entryId, weekId: emailsSent.weekId })
        .from(emailsSent)
        .where(and(inArray(emailsSent.weekId, [...weekNumberById.keys()]), eq(emailsSent.kind, REMINDER_KIND)))

    const due = planReminders({
        state,
        standings: computeStandings(state, now),
        now,
        joinedAt: new Map(rows.entries.map((entry) => {
            return [entry.id, entry.createdAt] as const
        })),
        alreadySent: new Set(sentRows.map((row) => {
            return reminderKey(row.entryId, weekNumberById.get(row.weekId) ?? 0)
        })),
    })

    return groupByPerson(rows, due)
}

function groupByPerson(
    rows: Awaited<ReturnType<typeof loadCompetitionRows>>,
    due: readonly ReminderDue[],
): readonly PersonReminder[] {
    const entryById = new Map(rows.entries.map((entry) => {
        return [entry.id, entry] as const
    }))
    const weekByNumber = new Map(rows.weeks.map((week) => {
        return [week.number, week] as const
    }))

    const groups = new Map<string, PersonReminder>()
    for (const reminder of due) {
        const entry = entryById.get(reminder.entryId)
        const week = weekByNumber.get(reminder.weekNumber)
        if (entry === undefined || week === undefined) {
            continue
        }

        const key = `${entry.personId}:${week.id}`
        const existing = groups.get(key)
        groups.set(key, {
            personId: entry.personId,
            weekId: week.id,
            weekNumber: week.number,
            plMatchday: week.plMatchday,
            cutoffAt: reminder.cutoffAt,
            entries: [...existing?.entries ?? [], { id: entry.id, name: entry.displayName }],
        })
    }

    return [...groups.values()]
}

async function sendOne(
    db: Database,
    mailer: Mailer,
    now: Date,
    siteUrl: string,
    reminder: PersonReminder,
): Promise<'sent' | 'failed' | 'skipped'> {
    // .invalid addresses can never receive email: demo bots and removed people.
    const [person] = await db.select().from(people).where(eq(people.id, reminder.personId))
    if (person === undefined || person.deletedAt !== null || person.email.endsWith('.invalid')) {
        return 'skipped'
    }

    const claimed = await db.insert(emailsSent)
        .values(reminder.entries.map((entry) => {
            return { entryId: entry.id, weekId: reminder.weekId, kind: REMINDER_KIND, sentAt: now }
        }))
        .onConflictDoNothing()
        .returning({ entryId: emailsSent.entryId })
    const claimedIds = claimed.map((row) => {
        return row.entryId
    })
    if (claimedIds.length === 0) {
        return 'skipped'
    }

    try {
        const token = await createLink(db, person.id, 'signin', reminder.cutoffAt, now)
        const link = new URL('/auth/verify', siteUrl)
        link.searchParams.set('token', token)
        link.searchParams.set('next', '/pick')

        const entryNames = reminder.entries
            .filter((entry) => {
                return claimedIds.includes(entry.id)
            })
            .map((entry) => {
                return entry.name
            })
        await mailer.send({
            to: person.email,
            ...reminderEmail(link.toString(), {
                weekNumber: reminder.weekNumber,
                plMatchday: reminder.plMatchday,
                cutoffLabel: formatDublin(reminder.cutoffAt),
                entryNames,
            }),
        })

        return 'sent'
    } catch (error) {
        console.error('Reminder email failed', error)
        await db.delete(emailsSent).where(and(
            eq(emailsSent.weekId, reminder.weekId),
            eq(emailsSent.kind, REMINDER_KIND),
            inArray(emailsSent.entryId, claimedIds),
        ))

        return 'failed'
    }
}
