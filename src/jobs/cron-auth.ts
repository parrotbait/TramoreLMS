// Created by Claude driven by Eddie Long on 2026-11-18.
//
// The scheduled routes (tick, backup) check the same secret. cron-job.org and
// Vercel Cron send `Authorization: Bearer <CRON_SECRET>`. The secret must be
// at least 32 characters, and the comparison takes the same time whatever the
// header says.

import { timingSafeEqual } from 'node:crypto'

export function isAuthorisedCron(request: Request): boolean {
    const secret = process.env['CRON_SECRET'] ?? ''
    if (secret.length < 32) {
        return false
    }

    const header = request.headers.get('authorization') ?? ''
    const expected = Buffer.from(`Bearer ${secret}`)
    const actual = Buffer.from(header)

    return actual.length === expected.length && timingSafeEqual(actual, expected)
}
