// Created by Claude driven by Eddie Long on 2026-11-22.
//
// Correcting a mistyped email, against a real database.

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { people } from '@/db/schema'

import { createTestDatabase } from '../../__tests__/support/database'
import type { TestDatabase } from '../../__tests__/support/database'
import { changePersonEmail } from '../people'

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

async function person(email: string, deletedAt: Date | null = null) {
    const [row] = await database.db.insert(people).values({ email, deletedAt }).returning()
    return row?.id ?? ''
}

async function emailOf(id: string) {
    const [row] = await database.db.select().from(people).where(eq(people.id, id))
    return row?.email
}

describe('changePersonEmail', () => {
    it('corrects a typo, tidying the address', async () => {
        const id = await person('sean@gmial.com')

        const result = await changePersonEmail(database.db, id, '  Sean@Gmail.com ')

        expect(result).toEqual({ kind: 'changed', email: 'sean@gmail.com' })
        expect(await emailOf(id)).toBe('sean@gmail.com')
    })

    it('refuses something that is not an email, and changes nothing', async () => {
        const id = await person('sean@gmail.com')

        expect(await changePersonEmail(database.db, id, 'not an email')).toEqual({ kind: 'invalid' })
        expect(await emailOf(id)).toBe('sean@gmail.com')
    })

    it('says so when the email is already theirs', async () => {
        const id = await person('sean@gmail.com')

        expect(await changePersonEmail(database.db, id, 'SEAN@gmail.com')).toEqual({ kind: 'same' })
    })

    it('refuses an address another player already has, as two people cannot share one', async () => {
        const id = await person('sean@gmial.com')
        const other = await person('aoife@gmail.com')

        expect(await changePersonEmail(database.db, id, 'aoife@gmail.com')).toEqual({ kind: 'taken' })
        expect(await emailOf(id)).toBe('sean@gmial.com')
        expect(await emailOf(other)).toBe('aoife@gmail.com')
    })

    it('does not touch a person whose details have been removed', async () => {
        const id = await person('removed-1@removed.invalid', new Date())

        expect(await changePersonEmail(database.db, id, 'new@example.ie')).toEqual({ kind: 'noPerson' })
        expect(await emailOf(id)).toBe('removed-1@removed.invalid')
    })

    it('says nobody was found for an id that does not exist', async () => {
        expect(await changePersonEmail(database.db, '00000000-0000-4000-8000-000000000000', 'a@b.ie')).toEqual({
            kind: 'noPerson',
        })
    })
})
