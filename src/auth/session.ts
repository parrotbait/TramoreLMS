// Created by Claude driven by Eddie Long on 2026-11-01.
//
// The signed-in person for the current request. Server only.
// Admin rights are checked against ADMIN_EMAILS on every request, so
// removing an address from the list takes effect at once (Decision 10).

import { cookies, headers } from 'next/headers'

import { getDatabase } from '@/db/client'
import { mailerFromEnv } from '@/email/mailer'

import type { AuthEnvironment } from './flows'
import { normaliseSiteUrl, parseAdminEmails } from './rules'
import { resolveSiteUrl } from './site-host'
import { findSession } from './store'

export const SESSION_COOKIE = 'lms_session'

export interface CurrentSession {
    readonly personId: string
    readonly email: string
    readonly isAdmin: boolean
}

export async function currentSession(): Promise<CurrentSession | null> {
    const value = (await cookies()).get(SESSION_COOKIE)?.value
    if (value === undefined || value === '') {
        return null
    }

    const record = await findSession(getDatabase(), value, new Date())
    if (record === null) {
        return null
    }

    const isAdmin = record.isAdmin && parseAdminEmails(process.env['ADMIN_EMAILS']).has(record.email)
    return { personId: record.personId, email: record.email, isAdmin }
}

export async function setSessionCookie(value: string, expiresAt: Date) {
    (await cookies()).set(SESSION_COOKIE, value, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        expires: expiresAt,
    })
}

export async function clearSessionCookie() {
    (await cookies()).delete(SESSION_COOKIE)
}

export async function sessionCookieValue(): Promise<string | undefined> {
    return (await cookies()).get(SESSION_COOKIE)?.value
}

export async function authEnvironment(): Promise<AuthEnvironment> {
    return {
        db: getDatabase(),
        mailer: mailerFromEnv(),
        now: new Date(),
        siteUrl: await requestSiteUrl(),
        adminEmails: process.env['ADMIN_EMAILS'],
    }
}

/**
 * The address this request came in on, if it is one of ours (see site-host.ts),
 * so links and Stripe returns stay on the address the player started on.
 * Otherwise siteUrl().
 */
export async function requestSiteUrl(): Promise<string> {
    const incoming = await headers()
    return hostedSiteUrl(incoming.get('x-forwarded-host') ?? incoming.get('host'))
}

/** The same, for a route that has its host in hand. */
export function hostedSiteUrl(host: string | null): string {
    return resolveSiteUrl({
        host,
        canonical: siteUrl(),
        aliases: process.env['SITE_ALIASES'],
        vercelProduction: process.env['VERCEL_PROJECT_PRODUCTION_URL'],
    })
}

/** SITE_URL, or Vercel's production address, or localhost in development. */
export function siteUrl(): string {
    const configured = process.env['SITE_URL']
    if (configured !== undefined && configured.trim() !== '') {
        return normaliseSiteUrl(configured)
    }

    const vercel = process.env['VERCEL_PROJECT_PRODUCTION_URL']
    if (vercel !== undefined && vercel !== '') {
        return normaliseSiteUrl(vercel)
    }

    return 'http://localhost:3000'
}
