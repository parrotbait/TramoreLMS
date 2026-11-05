// Created by Claude driven by Eddie Long on 2026-11-01.
//
// The signed-in person for the current request. Server only.
// Admin rights are checked against ADMIN_EMAILS on every request, so
// removing an address from the list takes effect at once (Decision 10).

import { cookies } from 'next/headers'

import { getDatabase } from '@/db/client'
import { mailerFromEnv } from '@/email/mailer'

import type { AuthEnvironment } from './flows'
import { normaliseSiteUrl, parseAdminEmails } from './rules'
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

export function authEnvironment(): AuthEnvironment {
    return {
        db: getDatabase(),
        mailer: mailerFromEnv(),
        now: new Date(),
        siteUrl: siteUrl(),
        adminEmails: process.env['ADMIN_EMAILS'],
    }
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
