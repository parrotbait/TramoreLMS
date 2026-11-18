// Created by Claude driven by Eddie Long on 2026-11-18.
//
// Signing up through a demo invite link, against a real database. It is the
// real sign-up, so the payment code is the real code. These tests check that
// the entry lands in the demo, that a demo can never charge a real card or
// sign someone in without their email, and that a wipe leaves nothing behind.

import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { competitions, entries, payments, people } from '@/db/schema'
import { claimCheckoutSignIn, confirmPayment, startEntry } from '@/payments/service'

import { createTestDatabase } from '../../__tests__/support/database'
import type { TestDatabase } from '../../__tests__/support/database'
import {
    ENTRY_FEE_CENTS,
    NOW,
    environmentOf,
    fakeGateway,
    fakeMailer,
    seedCompetition,
} from '../../__tests__/support/payments'
import { BOT_DOMAIN } from '../constants'
import { isDemoLinkUsable } from '../join-link'
import { joinCodeFor } from '../join-code'
import { findDemo, wipeDemo } from '../service'

const SECRET = 'a-site-secret-that-is-at-least-32-characters-long'
const HOUR_MS = 60 * 60 * 1000

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

/** A competition turned into a demo: its own clock, and no entries through /enter. */
async function seedDemo() {
    const demoId = await seedCompetition(database.db)
    await database.db.update(competitions)
        .set({ isDemo: true, demoNow: NOW, entriesOpen: false })
        .where(eq(competitions.id, demoId))

    return demoId
}

function rig() {
    const gateway = fakeGateway()
    const mailer = fakeMailer()
    const environment = (now: Date = NOW) => {
        return { ...environmentOf(database.db, gateway, mailer, now), adminEmails: 'boss@example.ie' }
    }

    /** Signs up through the demo link, and returns what the player would have after the Stripe page. */
    const joinDemo = async (demoId: string, displayName: string, email: string, now: Date = NOW) => {
        const result = await startEntry(environment(now), { displayName, email }, { demoCompetitionId: demoId })
        if (result.kind !== 'checkout') {
            throw new Error(`Expected a checkout, got ${result.kind}`)
        }

        const [found] = await database.db
            .select({ entry: entries })
            .from(entries)
            .innerJoin(people, eq(people.id, entries.personId))
            .where(and(eq(people.email, email), eq(entries.displayName, displayName)))
        const entryId = found?.entry.id ?? ''
        const [payment] = await database.db.select().from(payments).where(eq(payments.entryId, entryId))

        return { entryId, sessionId: payment?.stripeSessionId ?? '', token: result.checkout.checkoutToken }
    }

    const pay = async (entryId: string, sessionId: string) => {
        return confirmPayment(environment(), {
            kind: 'paid',
            sessionId,
            entryId,
            paymentKind: 'entry',
            amountCents: ENTRY_FEE_CENTS,
            paymentIntentId: `pi_${sessionId}`,
        })
    }

    return { gateway, mailer, environment, joinDemo, pay }
}

/** A bot player, as the demo makes them: a paid entry for an address that can never get mail. */
async function addBot(demoId: string, number: number) {
    await database.db.transaction(async (tx) => {
        const [person] = await tx.insert(people).values({ email: `bot-${number}${BOT_DOMAIN}` }).returning()
        const [entry] = await tx.insert(entries).values({
            competitionId: demoId,
            personId: person?.id ?? '',
            displayName: `Bot ${number}`,
            displayNameKey: `bot ${number}`,
            status: 'active',
        }).returning()
        await tx.insert(payments).values({
            entryId: entry?.id ?? '',
            kind: 'entry',
            method: 'other',
            status: 'paid',
            amountCents: 0,
        })
    })
}

describe('signing up through a demo link', () => {
    it('puts the player in the demo, asks Stripe for the demo’s entry fee, and holds their name', async () => {
        const demoId = await seedDemo()
        const { gateway, joinDemo } = rig()

        const joined = await joinDemo(demoId, 'Aoife', 'aoife@example.ie')

        const [entry] = await database.db.select().from(entries).where(eq(entries.id, joined.entryId))
        expect(entry).toMatchObject({ competitionId: demoId, status: 'pending', displayName: 'Aoife' })
        expect(gateway.requests).toHaveLength(1)
        expect(gateway.requests[0]).toMatchObject({ kind: 'entry', amountCents: ENTRY_FEE_CENTS, email: 'aoife@example.ie' })
        expect(gateway.requests[0]?.description).toContain('Last Man Standing Test')
    })

    it('is the only way in: the real entry page never finds a demo', async () => {
        await seedDemo()
        const { environment } = rig()

        const result = await startEntry(environment(), { displayName: 'Aoife', email: 'aoife@example.ie' })

        expect(result.kind).toBe('closed')
    })

    it('cannot be used to enter a real competition, or one that does not exist', async () => {
        const realId = await seedCompetition(database.db)
        const { gateway, environment } = rig()
        const input = { displayName: 'Aoife', email: 'aoife@example.ie' }

        const real = await startEntry(environment(), input, { demoCompetitionId: realId })
        const missing = await startEntry(environment(), input, {
            demoCompetitionId: '00000000-0000-4000-8000-000000000000',
        })

        expect(real.kind).toBe('closed')
        expect(missing.kind).toBe('closed')
        expect(gateway.requests).toEqual([])
    })

    it('refuses a name already in the demo, in any case or accent', async () => {
        const demoId = await seedDemo()
        const { environment, joinDemo, pay } = rig()
        const first = await joinDemo(demoId, 'Seán', 'sean@example.ie')
        await pay(first.entryId, first.sessionId)

        const result = await startEntry(
            environment(),
            { displayName: 'SEAN', email: 'someone.else@example.ie' },
            { demoCompetitionId: demoId },
        )

        expect(result.kind).toBe('nameTaken')
    })

    it('stops at the most guests, and the bots do not count', async () => {
        const demoId = await seedDemo()
        const { environment, joinDemo, pay } = rig()
        for (const number of [1, 2, 3, 4, 5]) {
            await addBot(demoId, number)
        }

        const first = await joinDemo(demoId, 'Aoife', 'aoife@example.ie')
        await pay(first.entryId, first.sessionId)
        const second = await joinDemo(demoId, 'Seán', 'sean@example.ie')
        await pay(second.entryId, second.sessionId)
        const input = { displayName: 'Nuala', email: 'nuala@example.ie' }

        // Two real guests are in, and five bots. With a limit of 2 it is full.
        const full = await startEntry(environment(), input, { demoCompetitionId: demoId, maxDemoGuests: 2 })
        // With a limit of 3 there is room for one more. The five bots did not take the places.
        const room = await startEntry(environment(), input, { demoCompetitionId: demoId, maxDemoGuests: 3 })

        expect(full.kind).toBe('closed')
        expect(room.kind).toBe('checkout')
    })

    it('lets someone in once a guest who never paid has had their hour', async () => {
        const demoId = await seedDemo()
        const { environment, joinDemo } = rig()
        await joinDemo(demoId, 'Aoife', 'aoife@example.ie')
        const later = new Date(NOW.getTime() + HOUR_MS + 60_000)

        const result = await startEntry(
            environment(later),
            { displayName: 'Seán', email: 'sean@example.ie' },
            { demoCompetitionId: demoId, maxDemoGuests: 1 },
        )

        expect(result.kind).toBe('checkout')
    })
})

describe('paying in a demo', () => {
    it('makes them a player in the demo, and the welcome email says it is a demo with no real money', async () => {
        const demoId = await seedDemo()
        const { mailer, joinDemo, pay } = rig()
        const joined = await joinDemo(demoId, 'Aoife', 'aoife@example.ie')

        await pay(joined.entryId, joined.sessionId)

        const [entry] = await database.db.select().from(entries).where(eq(entries.id, joined.entryId))
        expect(entry?.status).toBe('active')
        expect(mailer.sent).toHaveLength(1)
        expect(mailer.sent[0]?.to).toBe('aoife@example.ie')
        expect(mailer.sent[0]?.text).toContain('You’re in the demo')
        expect(mailer.sent[0]?.text).toContain('no real money was taken')
        expect(mailer.sent[0]?.text).not.toContain('helping Tramore Athletic')
        expect(mailer.sent[0]?.text).toContain('/auth/verify?token=')
    })

    it('does not email the admins about a demo player', async () => {
        const demoId = await seedDemo()
        const { mailer, joinDemo, pay } = rig()
        const joined = await joinDemo(demoId, 'Aoife', 'aoife@example.ie')

        await pay(joined.entryId, joined.sessionId)

        expect(mailer.sent.filter((message) => {
            return message.subject.startsWith('New player')
        })).toEqual([])
    })

    it('never signs the browser in from the Stripe return, so an email must be proved by its link', async () => {
        const demoId = await seedDemo()
        const { joinDemo, pay } = rig()
        const joined = await joinDemo(demoId, 'Aoife', 'aoife@example.ie')
        await pay(joined.entryId, joined.sessionId)

        const personId = await claimCheckoutSignIn(database.db, joined.sessionId, joined.token, NOW)

        expect(personId).toBeNull()
    })
})

describe('wiping the demo', () => {
    it('removes a guest who paid through Stripe, their payment, and the competition', async () => {
        const demoId = await seedDemo()
        const { joinDemo, pay } = rig()
        const joined = await joinDemo(demoId, 'Aoife', 'aoife@example.ie')
        await pay(joined.entryId, joined.sessionId)
        await addBot(demoId, 1)

        const removed = await wipeDemo(database.db, undefined)

        expect(removed).toBe(2)
        expect(await database.db.select().from(competitions)).toEqual([])
        expect(await database.db.select().from(payments)).toEqual([])
        expect(await database.db.select().from(people)).toEqual([])
    })
})

describe('the invite link', () => {
    const saved = { cron: process.env['CRON_SECRET'], stripe: process.env['STRIPE_SECRET_KEY'] }

    beforeEach(() => {
        process.env['CRON_SECRET'] = SECRET
        process.env['STRIPE_SECRET_KEY'] = 'sk_test_abc123'
    })

    afterEach(() => {
        if (saved.cron === undefined) {
            delete process.env['CRON_SECRET']
        } else {
            process.env['CRON_SECRET'] = saved.cron
        }

        if (saved.stripe === undefined) {
            delete process.env['STRIPE_SECRET_KEY']
        } else {
            process.env['STRIPE_SECRET_KEY'] = saved.stripe
        }
    })

    it('works with the right code while Stripe is in test mode', async () => {
        const demoId = await seedDemo()

        const demo = await isDemoLinkUsable(database.db, joinCodeFor(demoId, SECRET))

        expect(demo?.id).toBe(demoId)
    })

    it('does not work with a wrong code, or none', async () => {
        await seedDemo()

        expect(await isDemoLinkUsable(database.db, 'f'.repeat(24))).toBeNull()
        expect(await isDemoLinkUsable(database.db, '')).toBeNull()
    })

    it('is switched off whenever Stripe is not in test mode, so a demo can never charge a real card', async () => {
        const demoId = await seedDemo()
        process.env['STRIPE_SECRET_KEY'] = 'sk_live_abc123'

        expect(await isDemoLinkUsable(database.db, joinCodeFor(demoId, SECRET))).toBeNull()

        delete process.env['STRIPE_SECRET_KEY']
        expect(await isDemoLinkUsable(database.db, joinCodeFor(demoId, SECRET))).toBeNull()
    })

    it('is switched off when the site secret is missing or too short', async () => {
        const demoId = await seedDemo()
        const code = joinCodeFor(demoId, SECRET)

        process.env['CRON_SECRET'] = 'short'

        expect(await isDemoLinkUsable(database.db, code)).toBeNull()
    })

    it('stops working when the demo is wiped, and an old link does not open a new demo', async () => {
        const oldId = await seedDemo()
        const oldCode = joinCodeFor(oldId, SECRET)

        await wipeDemo(database.db, undefined)
        expect(await isDemoLinkUsable(database.db, oldCode)).toBeNull()

        const newId = await seedDemo()
        expect(newId).not.toBe(oldId)
        expect(await isDemoLinkUsable(database.db, oldCode)).toBeNull()
        expect((await findDemo(database.db))?.id).toBe(newId)
        expect(await isDemoLinkUsable(database.db, joinCodeFor(newId, SECRET))).not.toBeNull()
    })
})
