// Created by Claude driven by Eddie Long on 2026-11-01.
//
// The two sign-in flows: ask for a link, and use a link.

import type { Database } from '@/db/client'
import type { Mailer } from '@/email/mailer'
import { signInEmail } from '@/email/templates'

import {
    canSendAnotherLink,
    linkExpiresAt,
    normaliseEmail,
    parseAdminEmails,
    safeNextPath,
    sessionCookieExpiresAt,
    sessionExpiresAt,
} from './rules'
import type { LinkPurpose } from './rules'
import {
    consumeLink,
    countLinksSince,
    createLink,
    createSession,
    findOrCreatePerson,
    findPersonByEmail,
    findPersonById,
} from './store'

const HOUR_MS = 60 * 60 * 1000

export interface AuthEnvironment {
    readonly db: Database
    readonly mailer: Mailer
    readonly now: Date
    /** For example https://tramorelastmanstanding.vercel.app */
    readonly siteUrl: string
    /** The raw ADMIN_EMAILS value. */
    readonly adminEmails: string | undefined
}

/**
 * The page shows the same reply for every outcome except a mistyped address,
 * so nobody can use this form to find out who has entered.
 */
export type LinkRequestResult =
    | { readonly kind: 'invalidEmail' }
    | { readonly kind: 'accepted' }

export async function requestSignInLink(
    environment: AuthEnvironment,
    rawEmail: string,
    purpose: LinkPurpose,
    next: string | undefined,
): Promise<LinkRequestResult> {
    const email = normaliseEmail(rawEmail)
    if (email === null) {
        return { kind: 'invalidEmail' }
    }

    const isAdmin = parseAdminEmails(environment.adminEmails).has(email)
    if (purpose === 'admin' && !isAdmin) {
        return { kind: 'accepted' }
    }

    const person = purpose === 'admin'
        ? await findOrCreatePerson(environment.db, email)
        : await findPersonByEmail(environment.db, email)
    if (person === null) {
        return { kind: 'accepted' }
    }

    const since = new Date(environment.now.getTime() - HOUR_MS)
    const recent = await countLinksSince(environment.db, person.id, since, purpose)
    if (!canSendAnotherLink(recent, purpose)) {
        return { kind: 'accepted' }
    }

    const expiresAt = linkExpiresAt(purpose, environment.now)
    const token = await createLink(environment.db, person.id, purpose, expiresAt, environment.now)
    const fallback = purpose === 'admin' ? '/admin' : '/pick'
    const link = new URL('/auth/verify', environment.siteUrl)
    link.searchParams.set('token', token)
    link.searchParams.set('next', safeNextPath(next, fallback))

    // If the mail server fails, the answer must still be the same as for an address we do not know.
    // Otherwise a failing server shows who has entered, and the page shows an error for them only.
    try {
        await environment.mailer.send({ to: email, ...signInEmail(link.toString(), purpose) })
    } catch (error) {
        console.error('Sign-in email failed:', error)
    }

    return { kind: 'accepted' }
}

export type VerifyResult =
    | { readonly kind: 'invalid' }
    | {
        readonly kind: 'signedIn'
        readonly cookieValue: string
        /** When the server forgets the session. */
        readonly expiresAt: Date
        /** When the browser forgets the cookie. */
        readonly cookieExpiresAt: Date
        readonly isAdmin: boolean
        readonly next: string
    }

/**
 * Uses the link and starts a session. An admin link only gives an admin
 * session if the address is still in ADMIN_EMAILS.
 */
export async function verifySignInLink(
    environment: AuthEnvironment,
    token: string,
    next: string | undefined,
): Promise<VerifyResult> {
    const link = await consumeLink(environment.db, token, environment.now)
    if (link === null) {
        return { kind: 'invalid' }
    }

    const person = await findPersonById(environment.db, link.personId)
    const isAdmin = link.purpose === 'admin'
        && person !== null
        && parseAdminEmails(environment.adminEmails).has(person.email)
    const expiresAt = sessionExpiresAt(isAdmin, environment.now)
    const cookieValue = await createSession(environment.db, link.personId, isAdmin, expiresAt, environment.now)

    return {
        kind: 'signedIn',
        cookieValue,
        expiresAt,
        cookieExpiresAt: sessionCookieExpiresAt(isAdmin, environment.now),
        isAdmin,
        next: safeNextPath(next, isAdmin ? '/admin' : '/pick'),
    }
}
