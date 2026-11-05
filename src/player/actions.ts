// Created by Claude driven by Eddie Long on 2026-11-03.
//
// The player's actions. Each one checks, on the server, who is signed in
// and that they own the entry. The browser decides nothing.

'use server'

import { and, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { currentSession } from '@/auth/session'
import type { PickActionResult } from '@/components/PickScreen'
import { getDatabase } from '@/db/client'
import { toGameState } from '@/db/game-state'
import { loadCompetitionRows } from '@/db/load'
import { entries, picks } from '@/db/schema'
import { validatePick } from '@/engine'
import { competitionNow } from '@/demo/clock'
import { isUuid } from '@/lib/ids'
import { buyBackAction } from '@/payments/actions'
import { pickRejectionMessage } from '@/view-models/messages'

import { ENTRY_COOKIE } from './load'

/**
 * Saves a pick. Runs under the same per-competition lock as the tick, so a
 * pick can never slip in while the cut-off is being applied.
 */
export async function pickTeamAction(entryId: string, weekNumber: number, teamId: string): Promise<PickActionResult> {
    const entry = await ownedEntry(entryId)
    if (entry === null || entry.status !== 'active') {
        return { ok: false, message: 'You need to pay before you can pick.' }
    }

    const db = getDatabase()
    const result = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${entry.competitionId}))`)
        const rows = await loadCompetitionRows(tx, entry.competitionId)
        const now = competitionNow(rows.competition, new Date())
        const validation = validatePick(toGameState(rows), now, entry.id, weekNumber, teamId)
        if (!validation.ok) {
            return { ok: false, message: pickRejectionMessage(validation.reason) } as const
        }

        const week = rows.weeks.find((candidate) => {
            return candidate.number === weekNumber
        })
        const team = rows.teams.find((candidate) => {
            return candidate.id === teamId
        })
        if (week === undefined || team === undefined) {
            return { ok: false, message: pickRejectionMessage('teamNotAvailable') } as const
        }

        await tx.insert(picks)
            .values({ entryId: entry.id, weekId: week.id, teamId: team.id, source: 'player', updatedAt: now })
            .onConflictDoUpdate({
                target: [picks.entryId, picks.weekId],
                set: { teamId: team.id, source: 'player', updatedAt: now },
            })

        return { ok: true, teamName: team.fullName } as const
    })

    revalidatePath('/pick')
    return result
}

/** The buy-back button. Bound to one entry by the page. */
export async function buyBackForEntryAction(entryId: string) {
    const formData = new FormData()
    formData.set('entryId', entryId)
    await buyBackAction(formData)
}

/** The entry switcher, for one email with several paid entries. */
export async function selectEntryAction(formData: FormData) {
    const entryId = String(formData.get('entryId') ?? '')
    const entry = await ownedEntry(entryId)
    if (entry !== null) {
        (await cookies()).set(ENTRY_COOKIE, entry.id, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 300 * 24 * 60 * 60,
        })
    }

    revalidatePath('/', 'layout')
}

async function ownedEntry(entryId: string) {
    const session = await currentSession()
    if (session === null) {
        redirect('/signin?next=/pick')
    }

    if (!isUuid(entryId)) {
        return null
    }

    const [entry] = await getDatabase()
        .select()
        .from(entries)
        .where(and(eq(entries.id, entryId), eq(entries.personId, session.personId)))

    return entry ?? null
}
