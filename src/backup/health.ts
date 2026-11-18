// Created by Claude driven by Eddie Long on 2026-11-18.
//
// Is the backup keeping up? Backups run every 6 hours, so one older than 12
// hours means at least one run was missed. Pure, so it is tested.

const HOUR_MS = 60 * 60 * 1000

export const LATE_AFTER_HOURS = 12

export type BackupHealth =
    | { readonly state: 'notSetUp' }
    | { readonly state: 'none' }
    | { readonly state: 'ok'; readonly hoursAgo: number }
    | { readonly state: 'late'; readonly hoursAgo: number }

export function backupHealth(isStoreConnected: boolean, latest: Date | null, now: Date): BackupHealth {
    if (!isStoreConnected) {
        return { state: 'notSetUp' }
    }

    if (latest === null) {
        return { state: 'none' }
    }

    const hoursAgo = Math.max(0, Math.floor((now.getTime() - latest.getTime()) / HOUR_MS))
    return { state: hoursAgo > LATE_AFTER_HOURS ? 'late' : 'ok', hoursAgo }
}
