// Created by Claude driven by Eddie Long on 2026-11-18.
//
// The secret part of a demo invite link. It is worked out from the demo's id
// and the site secret, so nothing is stored. Wiping the demo and starting a
// new one gives a new id, so old links stop working by themselves.

import { createHmac, timingSafeEqual } from 'node:crypto'

const CODE_LENGTH = 24

export function joinCodeFor(demoId: string, secret: string): string {
    return createHmac('sha256', secret).update(`demo-join:${demoId}`).digest('hex').slice(0, CODE_LENGTH)
}

export function isJoinCodeValid(code: string, demoId: string, secret: string): boolean {
    const expected = Buffer.from(joinCodeFor(demoId, secret))
    const actual = Buffer.from(code)

    return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** The site secret, or `null` if it is missing or too short to trust. */
export function joinSecret(): string | null {
    const secret = process.env['CRON_SECRET'] ?? ''
    return secret.length < 32 ? null : secret
}
