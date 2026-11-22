// Created by Claude driven by Eddie Long on 2026-11-22.
//
// Sessions and sign-in links, against a real database: a player stays signed in
// while in use but not for ever, one kind of link never blocks another, and a
// failing mail server shows nobody who has entered.

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { people, sessions } from '@/db/schema'

import { createTestDatabase } from '../../__tests__/support/database'
import type { TestDatabase } from '../../__tests__/support/database'
import { fakeMailer } from '../../__tests__/support/payments'
import { requestSignInLink } from '../flows'
import type { AuthEnvironment } from '../flows'
import {
    ADMIN_SESSION_TTL_MS,
    MAX_ADMIN_LINKS_PER_HOUR,
    MAX_PLAYER_LINKS_PER_HOUR,
    PLAYER_SESSION_TTL_MS,
} from '../rules'
import { createSession, findSession } from '../store'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-22T12:00:00Z')

let database: TestDatabase

beforeAll(async () => {
    database = await createTestDatabase()
}, 60_000)

afterAll(async () => {
    await database.close()
})

beforeEach(async () => {
    await database.reset()
})

async function person(email: string) {
    const [row] = await database.db.insert(people).values({ email }).returning()
    return row?.id ?? ''
}

/** When the server will forget the one session in the database. */
async function expiryOfOnlySession() {
    const [row] = await database.db.select().from(sessions)
    expect(row).toBeDefined()
    return row?.expiresAt
}

describe('a player’s session', () => {
    it('lets the server forget a session 30 days after the last use, not 300', () => {
        expect(PLAYER_SESSION_TTL_MS).toBe(30 * DAY_MS)
    })

    it('starts again past the half-way point, so someone who plays every week stays signed in', async () => {
        const id = await person('aoife@example.ie')
        const cookie = await createSession(database.db, id, false, new Date(NOW.getTime() + 10 * DAY_MS), NOW)

        const found = await findSession(database.db, cookie, NOW)

        expect(found?.email).toBe('aoife@example.ie')
        expect(await expiryOfOnlySession()).toEqual(new Date(NOW.getTime() + PLAYER_SESSION_TTL_MS))
    })

    it('is left alone while it is fresh, so a visit is not a database write each time', async () => {
        const id = await person('aoife@example.ie')
        const fresh = new Date(NOW.getTime() + 29 * DAY_MS)
        const cookie = await createSession(database.db, id, false, fresh, NOW)

        await findSession(database.db, cookie, NOW)

        expect(await expiryOfOnlySession()).toEqual(fresh)
    })

    it('is gone once it has run out, and a visit does not bring it back', async () => {
        const id = await person('aoife@example.ie')
        const cookie = await createSession(database.db, id, false, new Date(NOW.getTime() - 1000), NOW)

        expect(await findSession(database.db, cookie, NOW)).toBeNull()
        expect(await expiryOfOnlySession()).toEqual(new Date(NOW.getTime() - 1000))
    })

    it('is gone when the person has been deleted', async () => {
        const id = await person('aoife@example.ie')
        const cookie = await createSession(database.db, id, false, new Date(NOW.getTime() + DAY_MS), NOW)
        await database.db.update(people).set({ deletedAt: NOW }).where(eq(people.id, id))

        expect(await findSession(database.db, cookie, NOW)).toBeNull()
    })
})

describe('an admin session', () => {
    it('never slides: it ends 7 days after the link was used, however often it is used', async () => {
        const id = await person('boss@example.ie')
        const endsSoon = new Date(NOW.getTime() + DAY_MS)
        const cookie = await createSession(database.db, id, true, endsSoon, NOW)

        const found = await findSession(database.db, cookie, NOW)

        expect(found?.isAdmin).toBe(true)
        expect(await expiryOfOnlySession()).toEqual(endsSoon)
        expect(ADMIN_SESSION_TTL_MS).toBe(7 * DAY_MS)
    })
})

describe('asking for a sign-in link', () => {
    const adminEmails = 'boss@example.ie'

    function environment(mailer: AuthEnvironment['mailer']): AuthEnvironment {
        return { db: database.db, mailer, now: NOW, siteUrl: 'https://lms.test', adminEmails }
    }

    it('stops after 5 player links an hour, and the 6th is answered the same but sends nothing', async () => {
        await person('aoife@example.ie')
        const mailer = fakeMailer()

        for (let attempt = 0; attempt < MAX_PLAYER_LINKS_PER_HOUR + 2; attempt += 1) {
            expect((await requestSignInLink(environment(mailer), 'aoife@example.ie', 'signin', undefined)).kind).toBe('accepted')
        }

        expect(mailer.sent).toHaveLength(MAX_PLAYER_LINKS_PER_HOUR)
    })

    it('never lets requests for player links block an admin’s link', async () => {
        await person('boss@example.ie')
        const mailer = fakeMailer()
        for (let attempt = 0; attempt < MAX_PLAYER_LINKS_PER_HOUR + 3; attempt += 1) {
            await requestSignInLink(environment(mailer), 'boss@example.ie', 'signin', undefined)
        }

        const before = mailer.sent.length
        await requestSignInLink(environment(mailer), 'boss@example.ie', 'admin', undefined)

        expect(before).toBe(MAX_PLAYER_LINKS_PER_HOUR)
        expect(mailer.sent).toHaveLength(MAX_PLAYER_LINKS_PER_HOUR + 1)
        expect(mailer.sent.at(-1)?.subject).toContain('admin')
    })

    it('limits admin links to 3 an hour', async () => {
        const mailer = fakeMailer()

        for (let attempt = 0; attempt < MAX_ADMIN_LINKS_PER_HOUR + 2; attempt += 1) {
            await requestSignInLink(environment(mailer), 'boss@example.ie', 'admin', undefined)
        }

        expect(mailer.sent).toHaveLength(MAX_ADMIN_LINKS_PER_HOUR)
    })

    it('answers the same for an address that has never entered, and sends nothing', async () => {
        const mailer = fakeMailer()

        const result = await requestSignInLink(environment(mailer), 'nobody@example.ie', 'signin', undefined)

        expect(result).toEqual({ kind: 'accepted' })
        expect(mailer.sent).toEqual([])
    })

    it('answers the same when the mail server is down, so a failure does not show who has entered', async () => {
        await person('aoife@example.ie')
        const broken = {
            send: async () => {
                throw new Error('SMTP connection timed out')
            },
        }

        const known = await requestSignInLink(environment(broken), 'aoife@example.ie', 'signin', undefined)
        const unknown = await requestSignInLink(environment(broken), 'nobody@example.ie', 'signin', undefined)

        expect(known).toEqual({ kind: 'accepted' })
        expect(unknown).toEqual(known)
    })

    it('only gives an admin link to an address on the admin list', async () => {
        await person('aoife@example.ie')
        const mailer = fakeMailer()

        await requestSignInLink(environment(mailer), 'aoife@example.ie', 'admin', undefined)

        expect(mailer.sent).toEqual([])
    })
})
