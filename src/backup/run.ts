// Created by Claude driven by Eddie Long on 2026-11-18.
//
// One backup: export, encrypt, store. The cron route calls this. It throws on
// any failure, so cron-job.org sees the error and the admin is told.

import type { Database } from '@/db/client'

import { encryptSnapshot } from './crypto'
import { exportSnapshot } from './snapshot'
import type { BackupTable } from './snapshot'
import { backupPathname } from './store'
import type { BackupStore } from './store'

export interface BackupReport {
    readonly pathname: string
    readonly bytes: number
    readonly counts: Readonly<Record<BackupTable, number>>
}

export async function runBackup(deps: {
    readonly db: Database
    readonly store: BackupStore
    readonly publicKeyPem: string
    readonly now: Date
}): Promise<BackupReport> {
    const snapshot = await exportSnapshot(deps.db, deps.now)
    const body = Buffer.from(encryptSnapshot(snapshot, deps.publicKeyPem))
    const pathname = backupPathname(deps.now)
    await deps.store.save(pathname, body)

    return { pathname, bytes: body.length, counts: snapshot.counts }
}
