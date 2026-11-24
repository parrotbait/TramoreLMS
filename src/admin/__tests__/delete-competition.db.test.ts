// Created by Claude driven by Eddie Long on 2026-11-24.
//
// Deleting a draft competition, against a real database. Test payments may go.
// Real money never does.

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { auditLog, competitions, entries, payments, people, weeks } from '@/db/schema'

import { createTestDatabase } from '../../__tests__/support/database'
import type { TestDatabase } from '../../__tests__/support/database'
import { seedCompetition } from '../../__tests__/support/payments'
import { deleteDraftCompetition, isTestPayment } from '../delete-competition'

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

/** An active entry with one paid payment. The database insists on a paid entry payment. */
async function enter(competitionId: string, name: string, payment: { method: 'stripe' | 'cash'; sessionId?: string }) {
    const [person] = await database.db.insert(people).values({ email: `${name}@example.com` }).returning()
    const entryId = await database.db.transaction(async (tx) => {
        const [entry] = await tx.insert(entries).values({
            competitionId,
            personId: person?.id ?? '',
            displayName: name,
            displayNameKey: name,
            status: 'active',
        }).returning()
        await tx.insert(payments).values({
            entryId: entry?.id ?? '',
            kind: 'entry',
            method: payment.method,
            status: 'paid',
            amountCents: 1000,
            stripeSessionId: payment.sessionId ?? null,
        })

        return entry?.id ?? ''
    })

    return entryId
}

async function competitionCount() {
    const rows = await database.db.select().from(competitions)
    return rows.length
}

describe('isTestPayment', () => {
    it('is true only for a Stripe test session', () => {
        expect(isTestPayment({ method: 'stripe', stripeSessionId: 'cs_test_abc' })).toBe(true)
        expect(isTestPayment({ method: 'stripe', stripeSessionId: 'cs_live_abc' })).toBe(false)
        expect(isTestPayment({ method: 'stripe', stripeSessionId: null })).toBe(false)
        expect(isTestPayment({ method: 'cash', stripeSessionId: 'cs_test_abc' })).toBe(false)
    })
})

describe('deleteDraftCompetition', () => {
    it('deletes an empty draft with its weeks, and writes the audit log', async () => {
        const id = await seedCompetition(database.db, { status: 'draft', entriesOpen: false })

        const result = await deleteDraftCompetition(database.db, id, 'admin@example.com', 'testing')

        expect(result).toMatchObject({ kind: 'deleted', entryCount: 0 })
        expect(await competitionCount()).toBe(0)
        expect(await database.db.select().from(weeks).where(eq(weeks.competitionId, id))).toEqual([])
        const [audit] = await database.db.select().from(auditLog)
        expect(audit?.action).toBe('competition.delete')
        expect(audit?.reason).toBe('testing')
    })

    it('deletes a draft whose entries were all paid with Stripe test payments', async () => {
        const id = await seedCompetition(database.db, { status: 'draft', entriesOpen: false })
        await enter(id, 'ann', { method: 'stripe', sessionId: 'cs_test_1' })
        await enter(id, 'bob', { method: 'stripe', sessionId: 'cs_test_2' })

        const result = await deleteDraftCompetition(database.db, id, 'admin@example.com', 'testing')

        expect(result).toMatchObject({ kind: 'deleted', entryCount: 2 })
        expect(await competitionCount()).toBe(0)
        expect(await database.db.select().from(entries)).toEqual([])
        expect(await database.db.select().from(payments)).toEqual([])
    })

    it('refuses when any payment is real money, and deletes nothing', async () => {
        const id = await seedCompetition(database.db, { status: 'draft', entriesOpen: false })
        await enter(id, 'ann', { method: 'stripe', sessionId: 'cs_test_1' })
        await enter(id, 'bob', { method: 'cash' })
        await enter(id, 'cat', { method: 'stripe', sessionId: 'cs_live_3' })

        const result = await deleteDraftCompetition(database.db, id, 'admin@example.com', 'testing')

        expect(result).toEqual({ kind: 'realMoney', paymentCount: 2 })
        expect(await competitionCount()).toBe(1)
        expect((await database.db.select().from(entries)).length).toBe(3)
        expect((await database.db.select().from(payments)).length).toBe(3)
        expect(await database.db.select().from(auditLog)).toEqual([])
    })

    it('refuses a competition that is not a draft', async () => {
        const id = await seedCompetition(database.db, { status: 'open' })

        expect(await deleteDraftCompetition(database.db, id, 'admin@example.com', 'testing')).toEqual({ kind: 'notDraft' })
        expect(await competitionCount()).toBe(1)
    })

    it('refuses a demo', async () => {
        const id = await seedCompetition(database.db, { status: 'draft', entriesOpen: false })
        await database.db.update(competitions).set({ isDemo: true, demoNow: new Date() }).where(eq(competitions.id, id))

        expect(await deleteDraftCompetition(database.db, id, 'admin@example.com', 'testing')).toEqual({ kind: 'demo' })
        expect(await competitionCount()).toBe(1)
    })

    it('says so when there is no such competition', async () => {
        const result = await deleteDraftCompetition(database.db, '00000000-0000-4000-8000-000000000000', 'admin@example.com', 'testing')

        expect(result).toEqual({ kind: 'noCompetition' })
    })
})
