// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Everything the admin pages show for one competition. Server only.

import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { getDatabase } from '@/db/client'
import { toGameState } from '@/db/game-state'
import { loadCompetitionRows } from '@/db/load'
import type { CompetitionRows } from '@/db/game-state'
import { alerts, competitions, entries, payments, people } from '@/db/schema'
import { competitionNow } from '@/demo/clock'
import { computeStandings } from '@/engine'
import type { GameState, Standings } from '@/engine'
import { crestUrlOf } from '@/lib/crests'
import { isUuid } from '@/lib/ids'
import type { ViewContext } from '@/view-models/context'

import { moneyTotals } from './money'
import type { MoneyTotals } from './money'

export type PaymentRow = typeof payments.$inferSelect

export interface AdminCompetition {
    readonly rows: CompetitionRows
    readonly state: GameState
    readonly standings: Standings
    readonly context: ViewContext
    readonly emailOf: ReadonlyMap<string, string>
    readonly paymentsByEntry: ReadonlyMap<string, readonly PaymentRow[]>
    readonly money: MoneyTotals
    readonly openAlerts: number
    /** The latest week with a cut-off, or `null` before Week 1 opens. */
    readonly currentWeek: number | null
}

export const loadAdminCompetition = cache(async (competitionId: string): Promise<AdminCompetition> => {
    if (!isUuid(competitionId)) {
        notFound()
    }

    const db = getDatabase()
    const [exists] = await db
        .select({ id: competitions.id })
        .from(competitions)
        .where(eq(competitions.id, competitionId))
    if (exists === undefined) {
        notFound()
    }

    const rows = await loadCompetitionRows(db, competitionId)
    const now = competitionNow(rows.competition, new Date())
    const state = toGameState(rows)
    const standings = computeStandings(state, now)
    const entryIds = rows.entries.map((entry) => {
        return entry.id
    })
    const personIds = rows.entries.map((entry) => {
        return entry.personId
    })

    const [paymentRows, personRows, alertRows] = await Promise.all([
        entryIds.length === 0
            ? []
            : db.select().from(payments).where(inArray(payments.entryId, entryIds)).orderBy(payments.createdAt),
        personIds.length === 0
            ? []
            : db.select({ id: people.id, email: people.email }).from(people).where(inArray(people.id, personIds)),
        db.select({ id: alerts.id })
            .from(alerts)
            .where(and(eq(alerts.competitionId, competitionId), isNull(alerts.resolvedAt))),
    ])

    const emailByPerson = new Map(personRows.map((person) => {
        return [person.id, person.email] as const
    }))
    const emailOf = new Map(rows.entries.map((entry) => {
        return [entry.id, emailByPerson.get(entry.personId) ?? ''] as const
    }))
    const paymentsByEntry = new Map<string, PaymentRow[]>()
    for (const payment of paymentRows) {
        const list = paymentsByEntry.get(payment.entryId) ?? []
        list.push(payment)
        paymentsByEntry.set(payment.entryId, list)
    }

    const names = new Map(rows.entries.map((entry) => {
        return [entry.id, entry.displayName] as const
    }))
    const matchdays = new Map(rows.weeks.map((week) => {
        return [week.number, week.plMatchday] as const
    }))
    const slugs = new Map(rows.teams.map((team) => {
        return [team.id, team.slug] as const
    }))
    const opened = rows.weeks.filter((week) => {
        return week.cutoffAt !== null
    }).map((week) => {
        return week.number
    })

    return {
        rows,
        state,
        standings,
        context: {
            state,
            standings,
            now,
            nameOf: (entryId) => {
                return names.get(entryId) ?? 'Unknown'
            },
            plMatchdayOf: (weekNumber) => {
                return matchdays.get(weekNumber) ?? rows.competition.startMatchday + weekNumber - 1
            },
            crestOf: (teamId) => {
                const teamSlug = slugs.get(teamId)
                return teamSlug === undefined ? null : crestUrlOf(teamSlug)
            },
        },
        emailOf,
        paymentsByEntry,
        money: moneyTotals(paymentRows, rows.competition.prizeCents),
        openAlerts: alertRows.length,
        currentWeek: opened.length === 0 ? null : Math.max(...opened),
    }
})

export async function listCompetitions() {
    const db = getDatabase()
    const list = await db.select().from(competitions).orderBy(desc(competitions.createdAt))
    const counts = list.length === 0
        ? []
        : await db.select({ competitionId: entries.competitionId, status: entries.status }).from(entries)

    return list.map((competition) => {
        const own = counts.filter((row) => {
            return row.competitionId === competition.id
        })
        return {
            ...competition,
            activeEntries: own.filter((row) => {
                return row.status === 'active'
            }).length,
            pendingEntries: own.filter((row) => {
                return row.status === 'pending'
            }).length,
        }
    })
}
