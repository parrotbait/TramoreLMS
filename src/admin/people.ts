// Created by Claude driven by Eddie Long on 2026-11-22.
//
// Correcting a player's email, for example “gmial.com”. The email belongs to the
// person, so it changes for every entry they have. It never goes into the audit
// log: the log says that it changed, not what it was or what it became.

import { and, eq, isNull, ne } from 'drizzle-orm'

import { normaliseEmail } from '@/auth/rules'
import type { Database } from '@/db/client'
import { people } from '@/db/schema'

export type ChangeEmailResult =
    | { readonly kind: 'changed'; readonly email: string }
    | { readonly kind: 'invalid' }
    | { readonly kind: 'same' }
    /** Another player already has that address. Two people cannot share one. */
    | { readonly kind: 'taken' }
    | { readonly kind: 'noPerson' }

export async function changePersonEmail(db: Database, personId: string, rawEmail: string): Promise<ChangeEmailResult> {
    const email = normaliseEmail(rawEmail)
    if (email === null) {
        return { kind: 'invalid' }
    }

    return db.transaction(async (tx) => {
        const [person] = await tx.select().from(people).where(and(eq(people.id, personId), isNull(people.deletedAt)))
        if (person === undefined) {
            return { kind: 'noPerson' } as const
        }

        if (person.email === email) {
            return { kind: 'same' } as const
        }

        const [other] = await tx
            .select({ id: people.id })
            .from(people)
            .where(and(eq(people.email, email), ne(people.id, personId)))
        if (other !== undefined) {
            return { kind: 'taken' } as const
        }

        await tx.update(people).set({ email }).where(eq(people.id, personId))

        return { kind: 'changed', email } as const
    })
}
