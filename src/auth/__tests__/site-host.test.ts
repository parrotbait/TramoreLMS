// Created by Claude driven by Eddie Long on 2026-11-25.

import { describe, expect, it } from 'vitest'

import { resolveSiteUrl } from '../site-host'

const canonical = 'https://tramorelastmanstanding.vercel.app'
const base = { canonical, aliases: 'tramorelastmanstanding.ie', vercelProduction: 'tramorelastmanstanding.vercel.app' }

describe('resolveSiteUrl', () => {
    it('stays on the address the player started on, when it is one of ours', () => {
        expect(resolveSiteUrl({ ...base, host: 'tramorelastmanstanding.ie' })).toBe('https://tramorelastmanstanding.ie')
        expect(resolveSiteUrl({ ...base, host: 'tramorelastmanstanding.vercel.app' })).toBe(canonical)
    })

    it('ignores case and spaces in the host', () => {
        expect(resolveSiteUrl({ ...base, host: ' TramoreLastManStanding.IE ' })).toBe('https://tramorelastmanstanding.ie')
    })

    it('falls back to the main address for a host that is not ours', () => {
        expect(resolveSiteUrl({ ...base, host: 'evil.example' })).toBe(canonical)
        expect(resolveSiteUrl({ ...base, host: 'tramorelastmanstanding.ie.evil.example' })).toBe(canonical)
    })

    it('falls back when there is no host', () => {
        expect(resolveSiteUrl({ ...base, host: null })).toBe(canonical)
        expect(resolveSiteUrl({ ...base, host: '' })).toBe(canonical)
    })

    it('does not use an alias that is not configured', () => {
        expect(resolveSiteUrl({ ...base, aliases: undefined, host: 'tramorelastmanstanding.ie' })).toBe(canonical)
    })

    it('uses http for localhost, so local development works', () => {
        expect(resolveSiteUrl({
            host: 'localhost:3000',
            canonical: 'http://localhost:3000',
            aliases: undefined,
            vercelProduction: undefined,
        })).toBe('http://localhost:3000')
    })
})
