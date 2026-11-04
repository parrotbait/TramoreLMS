// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Decides who gets the reminder email (Decision 11), without touching the
// database. One rule covers both emails in PLAN.md section 6:
//
//   The cut-off is less than 24 hours away, the player can pick for the
//   week, and they haven't. One email per entry per week.
//
// A player whose previous result comes in after the 24-hour point (a Monday
// night game) can't pick until then. They become due on the next tick, which
// is the “late” email.
//
// A player who entered inside the 24 hours has just had the welcome email,
// which already asks them to pick, so they are left out.

import { isEligibleForWeek } from '@/engine'
import type { GameState, Standings } from '@/engine'

export const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000

export interface ReminderInput {
    readonly state: GameState
    readonly standings: Standings
    readonly now: Date
    /** When each entry was made. */
    readonly joinedAt: ReadonlyMap<string, Date>
    /** `entryId:weekNumber` for each reminder already sent. */
    readonly alreadySent: ReadonlySet<string>
}

export interface ReminderDue {
    readonly entryId: string
    readonly weekNumber: number
    readonly cutoffAt: Date
}

export function planReminders(input: ReminderInput): readonly ReminderDue[] {
    const { state, standings, now } = input
    const due: ReminderDue[] = []

    for (const week of state.weeks) {
        const cutoffAt = week.cutoffAt
        if (cutoffAt === null || !isInReminderWindow(cutoffAt, now)) {
            continue
        }

        const windowStart = cutoffAt.getTime() - REMINDER_LEAD_MS
        for (const entry of state.entries) {
            const joinedAt = input.joinedAt.get(entry.id)
            const isNewEntry = joinedAt !== undefined && joinedAt.getTime() >= windowStart
            if (isNewEntry) {
                continue
            }

            const hasPicked = state.picks.some((pick) => {
                return pick.entryId === entry.id && pick.week === week.number
            })
            if (hasPicked || input.alreadySent.has(reminderKey(entry.id, week.number))) {
                continue
            }

            if (!isEligibleForWeek(state, standings, entry.id, week.number)) {
                continue
            }

            due.push({ entryId: entry.id, weekNumber: week.number, cutoffAt })
        }
    }

    return due
}

export function reminderKey(entryId: string, weekNumber: number): string {
    return `${entryId}:${weekNumber}`
}

function isInReminderWindow(cutoffAt: Date, now: Date): boolean {
    const untilCutoff = cutoffAt.getTime() - now.getTime()
    return untilCutoff > 0 && untilCutoff <= REMINDER_LEAD_MS
}
