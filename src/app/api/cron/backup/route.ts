// Created by Claude driven by Eddie Long on 2026-11-18.
//
// The scheduled backup. cron-job.org calls this every 6 hours with
// `Authorization: Bearer <CRON_SECRET>`, like the tick. It exports the
// database, encrypts it with the public key, and stores it in Vercel Blob.
// Any failure returns a 500, so cron-job.org reports the run as failed.

import { getDatabase } from '@/db/client'
import { runBackup } from '@/backup/run'
import { backupStoreFromEnv } from '@/backup/store'
import { isAuthorisedCron } from '@/jobs/cron-auth'

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

    const publicKeyPem = process.env['BACKUP_PUBLIC_KEY'] ?? ''
    const store = backupStoreFromEnv()
    if (publicKeyPem === '' || store === null) {
        return Response.json(
            { ok: false, error: 'Set BACKUP_PUBLIC_KEY and connect a Blob store (BLOB_READ_WRITE_TOKEN).' },
            { status: 500 },
        )
    }

    try {
        const now = new Date()
        const report = await runBackup({ db: getDatabase(), store, publicKeyPem, now })

        return Response.json({ ok: true, ranAt: now.toISOString(), ...report })
    } catch (error) {
        console.error('Database backup failed:', error)
        const message = error instanceof Error ? error.message : String(error)

        return Response.json({ ok: false, error: message }, { status: 500 })
    }
}
