// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Reads everything the rules engine needs for one competition.

import { eq, inArray } from 'drizzle-orm'

import type { Database } from './client'
import type { CompetitionRows } from './game-state'
import {
    competitions,
    entries,
    fixtures,
    pickOverrides,
    picks,
    teams,
    weeks,
} from './schema'

/** A database handle or an open transaction. */
export type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0]

export async function loadCompetitionRows(db: Executor, competitionId: string): Promise<CompetitionRows> {
    const [competition] = await db.select().from(competitions).where(eq(competitions.id, competitionId))
    if (competition === undefined) {
        throw new Error(`No competition ${competitionId}`)
    }

    const [teamRows, weekRows, fixtureRows, entryRows] = await Promise.all([
        db.select().from(teams).where(eq(teams.competitionId, competitionId)),
        db.select().from(weeks).where(eq(weeks.competitionId, competitionId)),
        db.select().from(fixtures).where(eq(fixtures.competitionId, competitionId)),
        db.select().from(entries).where(eq(entries.competitionId, competitionId)),
    ])

    const entryIds = entryRows.map((entry) => {
        return entry.id
    })
    const [pickRows, overrideRows] = entryIds.length === 0
        ? [[], []]
        : await Promise.all([
            db.select().from(picks).where(inArray(picks.entryId, entryIds)),
            db.select().from(pickOverrides).where(inArray(pickOverrides.entryId, entryIds)),
        ])

    return {
        competition,
        teams: teamRows,
        weeks: weekRows,
        fixtures: fixtureRows,
        entries: entryRows,
        picks: pickRows,
        pickOverrides: overrideRows,
    }
}

/** Competitions the tick should look after. */
export async function activeCompetitionIds(db: Executor): Promise<readonly string[]> {
    const rows = await db
        .select({ id: competitions.id })
        .from(competitions)
        .where(inArray(competitions.status, ['open', 'running']))

    return rows.map((row) => {
        return row.id
    })
}
