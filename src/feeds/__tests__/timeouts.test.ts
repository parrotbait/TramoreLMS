// Created by Claude driven by Eddie Long on 2026-11-22.
//
// Every call out of the tick has a timeout. A call that hangs would use up the
// 60 seconds the tick has, and the cut-off would not be applied. These checks
// stop a timeout being removed by accident.

import { describe, expect, it } from 'vitest'

import { gmailTransportOptions } from '@/email/mailer'
import { STRIPE_TIMEOUT_MS } from '@/payments/stripe'

import { FEED_TIMEOUT_MS, fetchFootballData } from '../football-data'
import { fetchFpl } from '../fpl'

/** A fetch that records how it was called. What it answers does not matter here. */
function recordingFetch() {
    const calls: { url: string; init: RequestInit | undefined }[] = []
    const impl = (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init })
        return new Response('{}')
    }) as typeof fetch

    return { calls, impl }
}

describe('timeouts on every call out of the tick', () => {
    it('stops waiting for the main feed after a short time', async () => {
        const { calls, impl } = recordingFetch()

        await fetchFootballData('token', 2026, impl).catch(() => undefined)

        expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal)
        expect(FEED_TIMEOUT_MS).toBeLessThanOrEqual(15_000)
    })

    it('stops waiting for the FPL feed after a short time, and says who is asking', async () => {
        const { calls, impl } = recordingFetch()

        await fetchFpl([], impl).catch(() => undefined)

        expect(calls.length).toBeGreaterThan(0)
        for (const call of calls) {
            expect(call.init?.signal).toBeInstanceOf(AbortSignal)
            expect(new Headers(call.init?.headers).get('user-agent')).toContain('TramoreLastManStanding')
        }
    })

    it('gives Stripe a short time to answer', () => {
        expect(STRIPE_TIMEOUT_MS).toBeGreaterThan(0)
        expect(STRIPE_TIMEOUT_MS).toBeLessThanOrEqual(15_000)
    })

    it('gives the mail server a short time to connect, greet and answer', () => {
        const options = gmailTransportOptions('club@example.ie', 'app-password')

        expect(options.connectionTimeout).toBeLessThanOrEqual(15_000)
        expect(options.greetingTimeout).toBeLessThanOrEqual(15_000)
        expect(options.socketTimeout).toBeLessThanOrEqual(30_000)
    })
})
