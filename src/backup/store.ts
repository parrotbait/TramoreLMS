// Created by Claude driven by Eddie Long on 2026-11-18.
//
// Where the encrypted backups are kept: a private Vercel Blob store. Vercel
// deletes each file itself after the retention time (ttlDays), so old
// backups, and the emails inside them, do not pile up.

import { list, put } from '@vercel/blob'

/** The privacy page promises emails are gone 90 days after a competition. Backups last 30. */
export const BACKUP_RETENTION_DAYS = 30

const PREFIX = 'backups/'

export interface StoredBackup {
    readonly pathname: string
    readonly uploadedAt: Date
    readonly size: number
}

export interface BackupStore {
    save(pathname: string, body: Buffer): Promise<void>
    latest(): Promise<StoredBackup | null>
}

export function vercelBlobStore(token: string): BackupStore {
    return {
        save: async (pathname, body) => {
            await put(pathname, body, {
                access: 'private',
                token,
                contentType: 'application/json',
                addRandomSuffix: false,
                allowOverwrite: false,
                ttlDays: BACKUP_RETENTION_DAYS,
            })
        },
        latest: async () => {
            const result = await list({ prefix: PREFIX, token, limit: 1000 })
            const newest = [...result.blobs].sort((left, right) => {
                return right.uploadedAt.getTime() - left.uploadedAt.getTime()
            })[0]

            return newest === undefined
                ? null
                : { pathname: newest.pathname, uploadedAt: newest.uploadedAt, size: newest.size }
        },
    }
}

/** `null` when no Blob store is connected, so the admin page can say backups are not set up. */
export function backupStoreFromEnv(): BackupStore | null {
    const token = process.env['BLOB_READ_WRITE_TOKEN'] ?? ''
    return token === '' ? null : vercelBlobStore(token)
}

export function backupPathname(now: Date): string {
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
    return `${PREFIX}lms-${stamp}.json`
}
