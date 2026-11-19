// Created by Claude driven by Eddie Long on 2026-11-19.
//
// The “entries open soon” figures: the newest real draft, never a demo, and
// nothing once no draft exists.

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { competitions } from '@/db/schema'

import { createTestDatabase } from '../../__tests__/support/database'
import type { TestDatabase } from '../../__tests__/support/database'
import { ENTRY_FEE_CENTS, seedCompetition } from '../../__tests__/support/payments'
import { loadUpcomingCompetition } from '../load'

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

describe('loadUpcomingCompetition', () => {
    it('returns the fee and prize of a draft', async () => {
        await seedCompetition(database.db, { status: 'draft' })

        const upcoming = await loadUpcomingCompetition(database.db)

        expect(upcoming).toEqual({
            name: 'Last Man Standing Test',
            entryFeeCents: ENTRY_FEE_CENTS,
            prizeCents: 30_000,
        })
    })

    it('ignores a demo draft', async () => {
        const id = await seedCompetition(database.db, { status: 'draft' })
        await database.db.update(competitions).set({ isDemo: true }).where(eq(competitions.id, id))

        expect(await loadUpcomingCompetition(database.db)).toBeNull()
    })

    it('returns null when there is no draft', async () => {
        await seedCompetition(database.db, { status: 'open' })

        expect(await loadUpcomingCompetition(database.db)).toBeNull()
    })
})
