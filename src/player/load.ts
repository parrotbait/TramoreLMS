// Created by Claude driven by Eddie Long on 2026-11-03.
//
// Everything a player page needs, loaded once per request.
//
//   1. Who is signed in. Signed-out visitors go to /signin.
//   2. Their entries, through the payment gate. Only paid entries play.
//   3. Which paid entry they are looking at (the entry switcher), checked
//      against ownership on every request.
//   4. The cut-off check (ensureLocked), so a late scheduler can never leave
//      picks open past the cut-off.
//   5. The game state and the view context for the screens.

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'

import { currentSession } from '@/auth/session'
import type { CurrentSession } from '@/auth/session'
import { getDatabase } from '@/db/client'
import { toGameState } from '@/db/game-state'
import { loadCompetitionRows } from '@/db/load'
import { computeStandings } from '@/engine'
import { entryGate } from '@/entries/gate'
import type { EntryGate, MyEntry } from '@/entries/gate'
import { entriesForPerson } from '@/entries/queries'
import { ensureLocked } from '@/jobs/tick'
import { crestUrlOf } from '@/lib/crests'
import type { ViewContext } from '@/view-models/context'

export const ENTRY_COOKIE = 'lms_entry'

export type PlayerPage =
    | { readonly kind: 'gate'; readonly session: CurrentSession; readonly gate: Exclude<EntryGate, { kind: 'ready' }> }
    | {
        readonly kind: 'ready'
        readonly session: CurrentSession
        readonly entry: MyEntry
        readonly paidEntries: readonly MyEntry[]
        readonly unpaidEntries: readonly MyEntry[]
        readonly context: ViewContext
        /** The latest week open for picking, or `null` before Week 1 opens. */
        readonly currentWeek: number | null
        readonly prizeCents: number
        readonly buybackFeeCents: number
    }

/** Memoised per request, so the layout and the page share one load. */
export const loadPlayerPage = cache(async (): Promise<PlayerPage> => {
    const session = await currentSession()
    if (session === null) {
        redirect('/signin?next=/pick')
    }

    const db = getDatabase()
    const now = new Date()
    const entries = await entriesForPerson(db, session.personId)
    const gate = entryGate(entries, now)
    if (gate.kind !== 'ready') {
        return { kind: 'gate', session, gate }
    }

    const chosenId = (await cookies()).get(ENTRY_COOKIE)?.value
    const entry = gate.paid.find((candidate) => {
        return candidate.entryId === chosenId
    }) ?? gate.paid[0]
    if (entry === undefined) {
        throw new Error('A ready gate always has a paid entry.')
    }

    await ensureLocked(db, entry.competitionId, now)
    const rows = await loadCompetitionRows(db, entry.competitionId)
    const state = toGameState(rows)

    const names = new Map(rows.entries.map((row) => {
        return [row.id, row.displayName] as const
    }))
    const matchdays = new Map(rows.weeks.map((week) => {
        return [week.number, week.plMatchday] as const
    }))
    const slugs = new Map(rows.teams.map((team) => {
        return [team.id, team.slug] as const
    }))
    const openedWeeks = rows.weeks
        .filter((week) => {
            return week.cutoffAt !== null
        })
        .map((week) => {
            return week.number
        })

    return {
        kind: 'ready',
        session,
        entry,
        paidEntries: gate.paid,
        unpaidEntries: gate.unpaid,
        context: {
            state,
            standings: computeStandings(state, now),
            now,
            nameOf: (entryId) => {
                return names.get(entryId) ?? 'A player'
            },
            plMatchdayOf: (weekNumber) => {
                return matchdays.get(weekNumber) ?? rows.competition.startMatchday + weekNumber - 1
            },
            crestOf: (teamId) => {
                const teamSlug = slugs.get(teamId)
                return teamSlug === undefined ? null : crestUrlOf(teamSlug)
            },
        },
        currentWeek: openedWeeks.length === 0 ? null : Math.max(...openedWeeks),
        prizeCents: rows.competition.prizeCents,
        buybackFeeCents: rows.competition.buybackFeeCents,
    }
})
