// Created by Claude driven by Eddie Long on 2026-11-18.
//
// Restores an encrypted backup into an empty database.
//
//   POSTGRES_URL='<new database, direct URL>' \
//     node --import tsx scripts/restore-backup.ts <backup-file> <private-key.pem>
//
// The database must already be migrated (pnpm db:migrate) and empty. The
// script refuses anything else, so it cannot overwrite live data. It does
// not read .env.local, so it never restores into your dev database by accident.

import { readFileSync } from 'node:fs'

import { decryptSnapshot, readHeader } from '@/backup/crypto'
import { BACKUP_TABLES, restoreSnapshot } from '@/backup/snapshot'
import { closeDatabase, getDatabase } from '@/db/client'

async function main() {
    const [backupFile, keyFile] = process.argv.slice(2)
    if (backupFile === undefined || keyFile === undefined) {
        console.error('Usage: node --import tsx scripts/restore-backup.ts <backup-file> <private-key.pem>')
        process.exitCode = 2
        return
    }

    const url = process.env['POSTGRES_URL'] ?? ''
    if (url === '') {
        console.error('Set POSTGRES_URL to the new, empty database.')
        process.exitCode = 2
        return
    }

    const text = readFileSync(backupFile, 'utf8')
    const header = readHeader(text)
    console.log(`Backup made ${header.createdAt}.`)
    console.log(`Restoring into ${new URL(url).host}${new URL(url).pathname} …`)

    const restored = await restoreSnapshot(getDatabase(), decryptSnapshot(text, readFileSync(keyFile, 'utf8')))
    for (const table of BACKUP_TABLES) {
        console.log(`${table}: ${restored[table]} rows`)
    }

    console.log('Restored. Point POSTGRES_URL in Vercel at this database and redeploy.')
}

main()
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
    })
    .finally(async () => {
        await closeDatabase()
    })
