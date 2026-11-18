// Created by Claude driven by Eddie Long on 2026-11-18.

import { afterEach, describe, expect, it } from 'vitest'

import { isStripeTestMode } from '@/payments/stripe'

import { isJoinCodeValid, joinCodeFor, joinSecret } from '../join-code'

const SECRET = 'a-site-secret-that-is-at-least-32-characters-long'
const DEMO_ID = '6f1c7a52-8d7e-4a34-9c2b-0a5d4b0e1c11'

describe('the demo invite code', () => {
    it('is the same every time for the same demo', () => {
        expect(joinCodeFor(DEMO_ID, SECRET)).toBe(joinCodeFor(DEMO_ID, SECRET))
        expect(joinCodeFor(DEMO_ID, SECRET)).toMatch(/^[0-9a-f]{24}$/)
    })

    it('opens the demo it was made for', () => {
        expect(isJoinCodeValid(joinCodeFor(DEMO_ID, SECRET), DEMO_ID, SECRET)).toBe(true)
    })

    it('stops working when the demo is wiped and a new one is started', () => {
        const oldCode = joinCodeFor(DEMO_ID, SECRET)

        expect(isJoinCodeValid(oldCode, 'c0ffee00-0000-4000-8000-000000000001', SECRET)).toBe(false)
    })

    it('does not work with another secret, a guess, or nothing', () => {
        const code = joinCodeFor(DEMO_ID, SECRET)

        expect(isJoinCodeValid(code, DEMO_ID, 'another-secret-that-is-also-32-characters-long')).toBe(false)
        expect(isJoinCodeValid('0'.repeat(24), DEMO_ID, SECRET)).toBe(false)
        expect(isJoinCodeValid('', DEMO_ID, SECRET)).toBe(false)
        expect(isJoinCodeValid(`${code}0`, DEMO_ID, SECRET)).toBe(false)
    })

    it('is not the site secret, and does not contain it', () => {
        expect(joinCodeFor(DEMO_ID, SECRET)).not.toContain(SECRET.slice(0, 8))
    })
})

describe('the site secret for invite codes', () => {
    const original = process.env['CRON_SECRET']

    afterEach(() => {
        if (original === undefined) {
            delete process.env['CRON_SECRET']
        } else {
            process.env['CRON_SECRET'] = original
        }
    })

    it('is missing when CRON_SECRET is unset or too short to trust', () => {
        delete process.env['CRON_SECRET']
        expect(joinSecret()).toBeNull()

        process.env['CRON_SECRET'] = 'too-short'
        expect(joinSecret()).toBeNull()

        process.env['CRON_SECRET'] = SECRET
        expect(joinSecret()).toBe(SECRET)
    })
})

describe('isStripeTestMode', () => {
    it('is true only for test keys, so a demo never charges a real card', () => {
        expect(isStripeTestMode('sk_test_abc123')).toBe(true)
        expect(isStripeTestMode('rk_test_abc123')).toBe(true)
        expect(isStripeTestMode('sk_live_abc123')).toBe(false)
        expect(isStripeTestMode('rk_live_abc123')).toBe(false)
        expect(isStripeTestMode('')).toBe(false)
        expect(isStripeTestMode(undefined)).toBe(false)
        expect(isStripeTestMode('xsk_test_abc')).toBe(false)
    })
})
