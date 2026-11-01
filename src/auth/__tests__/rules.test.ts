// Created by Claude driven by Eddie Long on 2026-11-01.

import { describe, expect, it } from 'vitest'

import {
    ADMIN_LINK_TTL_MS,
    canSendAnotherLink,
    linkExpiresAt,
    normaliseEmail,
    parseAdminEmails,
    PLAYER_LINK_TTL_MS,
    safeNextPath,
    sessionExpiresAt,
} from '../rules'
import { hashToken, newToken } from '../tokens'

const now = new Date('2026-11-01T12:00:00Z')

describe('normaliseEmail', () => {
    it('lower-cases and trims', () => {
        expect(normaliseEmail('  Aoife.K@Example.IE ')).toBe('aoife.k@example.ie')
    })

    it.each(['', 'not-an-email', 'a@b', 'two words@example.ie', '@example.ie'])('rejects “%s”', (input) => {
        expect(normaliseEmail(input)).toBeNull()
    })
})

describe('parseAdminEmails (Decision 10)', () => {
    it('reads a comma-separated list, ignoring case, spaces and bad entries', () => {
        expect(parseAdminEmails(' Eddie@Example.ie, second@example.ie,, nonsense ')).toEqual(
            new Set(['eddie@example.ie', 'second@example.ie']),
        )
    })

    it('is empty when unset, so nobody is an admin by accident', () => {
        expect(parseAdminEmails(undefined).size).toBe(0)
    })
})

describe('link and session lifetimes', () => {
    it('gives players 30 minutes and admins 15 to use a link', () => {
        expect(linkExpiresAt('signin', now).getTime() - now.getTime()).toBe(PLAYER_LINK_TTL_MS)
        expect(linkExpiresAt('admin', now).getTime() - now.getTime()).toBe(ADMIN_LINK_TTL_MS)
        expect(PLAYER_LINK_TTL_MS).toBe(30 * 60 * 1000)
        expect(ADMIN_LINK_TTL_MS).toBe(15 * 60 * 1000)
    })

    it('keeps players signed in for the season and admins for 7 days', () => {
        const day = 24 * 60 * 60 * 1000
        expect(sessionExpiresAt(false, now).getTime() - now.getTime()).toBe(300 * day)
        expect(sessionExpiresAt(true, now).getTime() - now.getTime()).toBe(7 * day)
    })
})

describe('canSendAnotherLink', () => {
    it('allows 3 links an hour, then stops', () => {
        expect(canSendAnotherLink(0)).toBe(true)
        expect(canSendAnotherLink(2)).toBe(true)
        expect(canSendAnotherLink(3)).toBe(false)
    })
})

describe('safeNextPath', () => {
    it.each([
        ['/pick', '/pick'],
        ['/picks?week=3', '/picks?week=3'],
        ['/admin', '/admin'],
    ])('keeps the site path “%s”', (next, expected) => {
        expect(safeNextPath(next)).toBe(expected)
    })

    it.each([
        'https://evil.example',
        '//evil.example',
        '/\\evil.example',
        'javascript:alert(1)',
        'pick',
        '/pick\nSet-Cookie: x',
    ])('refuses “%s” and goes to the pick page', (next) => {
        expect(safeNextPath(next)).toBe('/pick')
    })

    it('uses the fallback when there is no next path', () => {
        expect(safeNextPath(undefined, '/admin')).toBe('/admin')
    })
})

describe('tokens', () => {
    it('makes long, URL-safe, different tokens', () => {
        const first = newToken()
        const second = newToken()

        expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/)
        expect(first).not.toBe(second)
    })

    it('hashes the same token the same way, and never returns the token itself', () => {
        const token = newToken()
        expect(hashToken(token)).toBe(hashToken(token))
        expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/)
        expect(hashToken(token)).not.toContain(token)
    })
})
