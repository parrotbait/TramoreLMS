// Created by Claude driven by Eddie Long on 2026-11-01.
//
// Sign-in links and sessions in the database. Only token hashes are stored.

import { and, count, eq, gt, isNull, sql } from 'drizzle-orm'

import type { Database } from '@/db/client'
import { magicLinks, people, sessions } from '@/db/schema'

import { PLAYER_SESSION_RENEW_BELOW_MS, PLAYER_SESSION_TTL_MS } from './rules'
import type { LinkPurpose } from './rules'
import { hashToken, newToken } from './tokens'

export interface Person {
    readonly id: string
    readonly email: string
}

export async function findPersonByEmail(db: Database, email: string): Promise<Person | null> {
    const [person] = await db
        .select({ id: people.id, email: people.email })
        .from(people)
        .where(and(eq(people.email, email), isNull(people.deletedAt)))

    return person ?? null
}

export async function findPersonById(db: Database, personId: string): Promise<Person | null> {
    const [person] = await db
        .select({ id: people.id, email: people.email })
        .from(people)
        .where(and(eq(people.id, personId), isNull(people.deletedAt)))

    return person ?? null
}

/** Admins may have no entry, so the admin flow creates the person if needed. */
export async function findOrCreatePerson(db: Database, email: string): Promise<Person> {
    await db.insert(people).values({ email }).onConflictDoNothing()
    const person = await findPersonByEmail(db, email)
    if (person === null) {
        throw new Error('This email address has been removed and cannot sign in.')
    }

    return person
}

/** Links of one kind. Player and admin links are counted apart, so one can never block the other. */
export async function countLinksSince(
    db: Database,
    personId: string,
    since: Date,
    purpose: LinkPurpose,
): Promise<number> {
    const [row] = await db
        .select({ value: count() })
        .from(magicLinks)
        .where(and(eq(magicLinks.personId, personId), eq(magicLinks.purpose, purpose), gt(magicLinks.createdAt, since)))

    return row?.value ?? 0
}

/** Returns the token to put in the email. Only its hash is saved. */
export async function createLink(
    db: Database,
    personId: string,
    purpose: LinkPurpose,
    expiresAt: Date,
    now: Date,
): Promise<string> {
    const token = newToken()
    await db.insert(magicLinks).values({ tokenHash: hashToken(token), personId, purpose, expiresAt, createdAt: now })

    return token
}

/**
 * Uses a link up. Atomic: of two requests with the same token, only one wins.
 * Returns `null` for an unknown, used or expired link.
 */
export async function consumeLink(
    db: Database,
    token: string,
    now: Date,
): Promise<{ readonly personId: string; readonly purpose: LinkPurpose } | null> {
    const [link] = await db
        .update(magicLinks)
        .set({ usedAt: now })
        .where(and(
            eq(magicLinks.tokenHash, hashToken(token)),
            isNull(magicLinks.usedAt),
            gt(magicLinks.expiresAt, now),
        ))
        .returning({ personId: magicLinks.personId, purpose: magicLinks.purpose })

    return link ?? null
}

/** Returns the cookie value. Only its hash is saved. */
export async function createSession(
    db: Database,
    personId: string,
    isAdmin: boolean,
    expiresAt: Date,
    now: Date,
): Promise<string> {
    const value = newToken()
    await db.insert(sessions).values({ idHash: hashToken(value), personId, isAdmin, expiresAt, createdAt: now })

    return value
}

export interface SessionRecord {
    readonly personId: string
    readonly email: string
    readonly isAdmin: boolean
}

export async function findSession(db: Database, cookieValue: string, now: Date): Promise<SessionRecord | null> {
    const [record] = await db
        .select({
            personId: sessions.personId,
            email: people.email,
            isAdmin: sessions.isAdmin,
            expiresAt: sessions.expiresAt,
        })
        .from(sessions)
        .innerJoin(people, eq(people.id, sessions.personId))
        .where(and(
            eq(sessions.idHash, hashToken(cookieValue)),
            gt(sessions.expiresAt, now),
            isNull(people.deletedAt),
        ))
    if (record === undefined) {
        return null
    }

    // A player in use stays signed in. Past the half-way point, the session starts again.
    // An admin session never slides: it ends 7 days after the sign-in link was used.
    const remaining = record.expiresAt.getTime() - now.getTime()
    if (!record.isAdmin && remaining < PLAYER_SESSION_RENEW_BELOW_MS) {
        await db.update(sessions)
            .set({ expiresAt: new Date(now.getTime() + PLAYER_SESSION_TTL_MS) })
            .where(eq(sessions.idHash, hashToken(cookieValue)))
    }

    return { personId: record.personId, email: record.email, isAdmin: record.isAdmin }
}

export async function deleteSession(db: Database, cookieValue: string) {
    await db.delete(sessions).where(eq(sessions.idHash, hashToken(cookieValue)))
}

/** Housekeeping for the tick: drop expired links and sessions. */
export async function deleteExpired(db: Database, now: Date) {
    await db.delete(magicLinks).where(sql`${magicLinks.expiresAt} < ${now}`)
    await db.delete(sessions).where(sql`${sessions.expiresAt} < ${now}`)
}
