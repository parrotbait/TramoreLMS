// Created by Claude driven by Eddie Long on 2026-11-18.
//
// How fresh the last backup is, at the top of the admin home. A backup that
// quietly stops is worse than none, so a late one is shown in red.

import { backupHealth } from '@/backup/health'
import { backupStoreFromEnv } from '@/backup/store'
import { Card } from '@/components/admin/ui'
import { formatDublin } from '@/lib/format'

export async function BackupStatus() {
    const store = backupStoreFromEnv()
    let latest: Date | null = null
    let failed = false
    try {
        latest = (await store?.latest())?.uploadedAt ?? null
    } catch (error) {
        console.error('Could not read the backup status:', error)
        failed = true
    }

    const health = backupHealth(store !== null, latest, new Date())
    if (health.state === 'ok') {
        return (
            <Card title="Backups">
                <p className="text-sm">
                    ✓ Last backup {health.hoursAgo === 0 ? 'less than an hour' : `${health.hoursAgo} hours`} ago
                    {latest === null ? '' : ` (${formatDublin(latest)})`}.
                </p>
            </Card>
        )
    }

    return (
        <section className="space-y-1 rounded-2xl border-2 border-maroon bg-surface p-4">
            <h2 className="text-lg font-bold">Backups need attention</h2>
            <p className="text-sm">{messageFor(health, failed)}</p>
            <p className="text-xs text-muted">See RUNBOOK.md, “Backups”.</p>
        </section>
    )
}

function messageFor(health: ReturnType<typeof backupHealth>, failed: boolean): string {
    if (failed) {
        return 'The backup store could not be read. Check the Blob store in Vercel.'
    }

    switch (health.state) {
        case 'notSetUp':
            return 'Backups are not set up. No Blob store is connected to this project.'
        case 'none':
            return 'No backup has been made yet. Check the backup job on cron-job.org.'
        case 'late':
            return `The last backup was ${health.hoursAgo} hours ago. It should run every 6 hours. Check cron-job.org.`
        case 'ok':
            return ''
    }
}
