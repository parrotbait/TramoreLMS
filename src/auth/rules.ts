// Created by Claude driven by Eddie Long on 2026-11-01.
//
// Sign-in rules (Decisions 2 and 10). Pure, so they are unit tested.

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS

export type LinkPurpose =
    | 'signin'
    | 'admin'

export const PLAYER_LINK_TTL_MS = 30 * MINUTE_MS
export const ADMIN_LINK_TTL_MS = 15 * MINUTE_MS
/** “Lasts until the season ends.” A season runs from August to May. */
export const PLAYER_SESSION_TTL_MS = 300 * DAY_MS
export const ADMIN_SESSION_TTL_MS = 7 * DAY_MS
export const MAX_LINKS_PER_HOUR = 3

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DEFAULT_NEXT = '/pick'

/** Lower-case and trimmed, or `null` if it does not look like an email address. */
export function normaliseEmail(input: string): string | null {
    const email = input.trim().toLowerCase()
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
        return null
    }

    return email
}

/** ADMIN_EMAILS is a comma-separated list. Read on every request, never cached. */
export function parseAdminEmails(value: string | undefined): ReadonlySet<string> {
    const emails = (value ?? '')
        .split(',')
        .map((email) => {
            return normaliseEmail(email)
        })
        .filter((email): email is string => {
            return email !== null
        })

    return new Set(emails)
}

export function linkExpiresAt(purpose: LinkPurpose, now: Date): Date {
    const ttl = purpose === 'admin' ? ADMIN_LINK_TTL_MS : PLAYER_LINK_TTL_MS
    return new Date(now.getTime() + ttl)
}

export function sessionExpiresAt(isAdmin: boolean, now: Date): Date {
    const ttl = isAdmin ? ADMIN_SESSION_TTL_MS : PLAYER_SESSION_TTL_MS
    return new Date(now.getTime() + ttl)
}

export function canSendAnotherLink(linksInLastHour: number): boolean {
    return linksInLastHour < MAX_LINKS_PER_HOUR
}

/**
 * Where to go after signing in. Only paths on this site are allowed, so a
 * crafted link cannot send a player to another website.
 */
export function safeNextPath(next: string | null | undefined, fallback = DEFAULT_NEXT): string {
    if (next === null || next === undefined) {
        return fallback
    }

    const isSitePath = next.startsWith('/')
        && !next.startsWith('//')
        && !next.startsWith('/\\')
        && !/[\u0000-\u001f]/.test(next)
    if (!isSitePath) {
        return fallback
    }

    return next
}

/**
 * Adds https:// when the scheme is missing, and drops a trailing slash.
 * SITE_URL set to “tramorelastmanstanding.vercel.app” once broke every
 * sign-in link, because new URL() needs a scheme in the base.
 */
export function normaliseSiteUrl(value: string): string {
    const trimmed = value.trim().replace(/\/+$/, '')
    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed
    }

    return `https://${trimmed}`
}
