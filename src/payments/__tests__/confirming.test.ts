// Created by Claude driven by Eddie Long on 2026-11-22.

import { describe, expect, it } from 'vitest'

import { MAX_CONFIRM_ATTEMPTS, attemptOf, shouldKeepChecking } from '../confirming'

describe('the confirming-payment page checks a limited number of times', () => {
    it('starts at none, and counts what the address says', () => {
        expect(attemptOf(undefined)).toBe(0)
        expect(attemptOf(null)).toBe(0)
        expect(attemptOf('')).toBe(0)
        expect(attemptOf('7')).toBe(7)
    })

    it('treats anything odd as the start, so a made-up address cannot break it', () => {
        for (const odd of ['-3', '2.5', 'abc', 'NaN', '1e3x']) {
            expect(attemptOf(odd)).toBe(0)
        }
    })

    it('never counts past the limit, however large the number in the address', () => {
        expect(attemptOf('9999999')).toBe(MAX_CONFIRM_ATTEMPTS)
    })

    it('keeps checking until the limit, then stops and offers a button', () => {
        expect(shouldKeepChecking(0)).toBe(true)
        expect(shouldKeepChecking(MAX_CONFIRM_ATTEMPTS - 1)).toBe(true)
        expect(shouldKeepChecking(MAX_CONFIRM_ATTEMPTS)).toBe(false)
    })
})
