// Created by Claude driven by Eddie Long on 2026-10-31.

import type { Week } from './types'

/** Entries close at the Week 1 cut-off (Decision 4). */
export function areEntriesOpen(entriesOpenSetting: boolean, weekOne: Week | undefined, now: Date): boolean {
    if (!entriesOpenSetting) {
        return false
    }

    if (weekOne === undefined || weekOne.cutoffAt === null) {
        return true
    }

    return now.getTime() < weekOne.cutoffAt.getTime()
}
