// Created by Claude driven by Eddie Long on 2026-10-31.
//
// The scheduled tick. cron-job.org calls this every 10 minutes, and Vercel
// Cron calls it once a day as a backup (Decision 13). Both send
// `Authorization: Bearer <CRON_SECRET>`.

import { timingSafeEqual } from 'node:crypto'

import { getDatabase } from '@/db/client'
import { liveFeeds } from '@/jobs/live-feeds'
import { runTick } from '@/jobs/tick'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request): Promise<Response> {
    return handle(request)
}

export async function POST(request: Request): Promise<Response> {
    return handle(request)
}

async function handle(request: Request): Promise<Response> {
    const secret = process.env['CRON_SECRET'] ?? ''
    if (secret.length < 32 || !hasBearer(request, secret)) {
        return new Response('Unauthorised', { status: 401 })
    }

    const token = process.env['FOOTBALL_DATA_TOKEN'] ?? ''
    const feeds = token === '' ? null : liveFeeds(token)
    const reports = await runTick(getDatabase(), new Date(), feeds)

    return Response.json({ ranAt: new Date().toISOString(), reports })
}

function hasBearer(request: Request, secret: string): boolean {
    const header = request.headers.get('authorization') ?? ''
    const expected = Buffer.from(`Bearer ${secret}`)
    const actual = Buffer.from(header)

    return actual.length === expected.length && timingSafeEqual(actual, expected)
}
