// Created by Claude driven by Eddie Long on 2026-11-25.
//
// Wiping every player, against a real throwaway database. Never the live one.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { auditLog, competitions, entries, payments, people, picks, sessions, weeks } from '@/db/schema'

import { createTestDatabase } from '../../__tests__/support/database'
import type { TestDatabase } from '../../__tests__/support/database'
import { seedCompetition } from '../../__tests__/support/payments'
import { wipePlayers } from '../wipe-players'

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

const ADMIN = 'admin@example.com'
const base = { keepEmails: [ADMIN], manualPaymentsAreTests: false, execute: true, actorEmail: ADMIN }

async function person(email: string) {
    const [row] = await database.db.insert(people).values({ email }).returning()
    return row?.id ?? ''
}

async function enter(competitionId: string, name: string, method: 'stripe' | 'cash', sessionId?: string) {
    const personId = await person(`${name}@example.com`)
    await database.db.transaction(async (tx) => {
        const [entry] = await tx.insert(entries).values({
            competitionId,
            personId,
            displayName: name,
            displayNameKey: name,
            status: 'active',
        }).returning()
        await tx.insert(payments).values({
            entryId: entry?.id ?? '',
            kind: 'entry',
            method,
            status: 'paid',
            amountCents: 1000,
            stripeSessionId: sessionId ?? null,
        })
    })
}

async function counts() {
    return {
        people: (await database.db.select().from(people)).length,
        entries: (await database.db.select().from(entries)).length,
        payments: (await database.db.select().from(payments)).length,
        competitions: (await database.db.select().from(competitions)).length,
    }
}

describe('wipePlayers', () => {
    it('removes players, entries and payments, and keeps the admin and the competition', async () => {
        const id = await seedCompetition(database.db)
        await person(ADMIN)
        await enter(id, 'ann', 'stripe', 'cs_test_1')
        await enter(id, 'bob', 'stripe', 'cs_test_2')

        const result = await wipePlayers(database.db, base)

        expect(result).toEqual({ kind: 'wiped', counts: { people: 2, entries: 2, payments: 2 } })
        expect(await counts()).toEqual({ people: 1, entries: 0, payments: 0, competitions: 1 })
        const kept = await database.db.select().from(people)
        expect(kept[0]?.email).toBe(ADMIN)
        expect((await database.db.select().from(weeks)).length).toBeGreaterThan(0)
        expect((await database.db.select().from(auditLog))[0]?.action).toBe('players.wipe')
    })

    it('takes their sessions with them', async () => {
        const id = await seedCompetition(database.db)
        await enter(id, 'ann', 'stripe', 'cs_test_1')
        const [ann] = await database.db.select().from(people)
        await database.db.insert(sessions).values({
            idHash: 'h',
            personId: ann?.id ?? '',
            expiresAt: new Date(Date.now() + 1000),
        })

        await wipePlayers(database.db, base)

        expect(await database.db.select().from(sessions)).toEqual([])
        expect(await database.db.select().from(picks)).toEqual([])
    })

    it('changes nothing on a dry run, and says what would go', async () => {
        const id = await seedCompetition(database.db)
        await enter(id, 'ann', 'stripe', 'cs_test_1')

        const result = await wipePlayers(database.db, { ...base, execute: false })

        expect(result).toEqual({ kind: 'dryRun', counts: { people: 1, entries: 1, payments: 1 } })
        expect(await counts()).toEqual({ people: 1, entries: 1, payments: 1, competitions: 1 })
        expect(await database.db.select().from(auditLog)).toEqual([])
    })

    it('stops for a live Stripe payment, even when manual payments are called tests', async () => {
        const id = await seedCompetition(database.db)
        await enter(id, 'ann', 'stripe', 'cs_live_1')

        const result = await wipePlayers(database.db, { ...base, manualPaymentsAreTests: true })

        expect(result).toEqual({ kind: 'liveMoney', paymentCount: 1 })
        expect(await counts()).toEqual({ people: 1, entries: 1, payments: 1, competitions: 1 })
    })

    it('stops for cash entries until they are called tests', async () => {
        const id = await seedCompetition(database.db)
        await enter(id, 'ann', 'cash')

        expect(await wipePlayers(database.db, base)).toEqual({ kind: 'manualMoney', paymentCount: 1 })
        expect((await counts()).entries).toBe(1)

        const allowed = await wipePlayers(database.db, { ...base, manualPaymentsAreTests: true })
        expect(allowed.kind).toBe('wiped')
        expect((await counts()).entries).toBe(0)
    })
})
