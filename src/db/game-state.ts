// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Converts database rows into the rules engine's GameState. Pure, so it is
// tested without a database. Only paid entries are in the game: active ones,
// and withdrawn ones for the weeks before they withdrew. Pending and expired
// (unpaid) entries are left out (Decision 18).

import type {
    Entry,
    Fixture,
    FixtureOverride,
    FixtureState,
    GameState,
    Pick as EnginePick,
    PickOverride,
    Team,
    Week,
} from '@/engine'

import type * as schema from './schema'

type CompetitionRow = typeof schema.competitions.$inferSelect
type TeamRow = typeof schema.teams.$inferSelect
type WeekRow = typeof schema.weeks.$inferSelect
type FixtureRow = typeof schema.fixtures.$inferSelect
type EntryRow = typeof schema.entries.$inferSelect
type PickRow = typeof schema.picks.$inferSelect
type PickOverrideRow = typeof schema.pickOverrides.$inferSelect

export interface CompetitionRows {
    readonly competition: CompetitionRow
    readonly teams: readonly TeamRow[]
    readonly weeks: readonly WeekRow[]
    readonly fixtures: readonly FixtureRow[]
    readonly entries: readonly EntryRow[]
    readonly picks: readonly PickRow[]
    readonly pickOverrides: readonly PickOverrideRow[]
}

export function finalWeekOf(competition: CompetitionRow): number {
    return competition.finalMatchday - competition.startMatchday + 1
}

export function toGameState(rows: CompetitionRows): GameState {
    const weekNumberById = new Map(rows.weeks.map((week) => {
        return [week.id, week.number] as const
    }))
    const weekNumberOf = (weekId: string): number => {
        const number = weekNumberById.get(weekId)
        if (number === undefined) {
            throw new Error(`Unknown week ${weekId}`)
        }

        return number
    }

    const teams: Team[] = rows.teams.map((team) => {
        return { id: team.id, fullName: team.fullName }
    })

    const weeks: Week[] = rows.weeks.map((week) => {
        return { number: week.number, cutoffAt: week.cutoffAt }
    })

    const fixtures: Fixture[] = rows.fixtures.map((fixture) => {
        const override = toOverride(fixture)
        return {
            id: fixture.id,
            week: weekNumberOf(fixture.weekId),
            homeTeamId: fixture.homeTeamId,
            awayTeamId: fixture.awayTeamId,
            kickoffAt: fixture.kickoffAt,
            state: toFixtureState(fixture),
            ...(override === undefined ? {} : { override }),
        }
    })

    const entries: Entry[] = rows.entries
        .filter((entry) => {
            return entry.status === 'active' || entry.status === 'withdrawn'
        })
        .map((entry) => {
            const withdrawnFromWeek = withdrawnFrom(entry)
            return {
                id: entry.id,
                boughtBack: entry.boughtBack,
                ...(withdrawnFromWeek === undefined ? {} : { withdrawnFromWeek }),
            }
        })

    const paidEntryIds = new Set(entries.map((entry) => {
        return entry.id
    }))

    const picks: EnginePick[] = rows.picks
        .filter((pick) => {
            return paidEntryIds.has(pick.entryId)
        })
        .map((pick) => {
            return { entryId: pick.entryId, week: weekNumberOf(pick.weekId), teamId: pick.teamId, source: pick.source }
        })

    const pickOverrides: PickOverride[] = rows.pickOverrides
        .filter((override) => {
            return paidEntryIds.has(override.entryId)
        })
        .map((override) => {
            return { entryId: override.entryId, week: weekNumberOf(override.weekId), outcome: override.outcome }
        })

    return {
        teams,
        weeks,
        finalWeek: finalWeekOf(rows.competition),
        fixtures,
        entries,
        picks,
        pickOverrides,
    }
}

export function toFixtureState(fixture: FixtureRow): FixtureState {
    switch (fixture.state) {
        case 'scheduled':
            return { kind: 'scheduled' }
        case 'abandoned':
            return { kind: 'abandoned' }
        case 'postponed':
            return { kind: 'postponed', at: requireValue(fixture.postponedAt, 'postponed_at', fixture.id) }
        case 'finished':
            return {
                kind: 'finished',
                home: requireValue(fixture.homeGoals, 'home_goals', fixture.id),
                away: requireValue(fixture.awayGoals, 'away_goals', fixture.id),
            }
    }
}

/** The columns to write for a fixture state. The inverse of toFixtureState. */
export function fromFixtureState(state: FixtureState): Pick<FixtureRow, 'state' | 'homeGoals' | 'awayGoals' | 'postponedAt'> {
    switch (state.kind) {
        case 'scheduled':
        case 'abandoned':
            return { state: state.kind, homeGoals: null, awayGoals: null, postponedAt: null }
        case 'postponed':
            return { state: 'postponed', homeGoals: null, awayGoals: null, postponedAt: state.at }
        case 'finished':
            return { state: 'finished', homeGoals: state.home, awayGoals: state.away, postponedAt: null }
    }
}

function toOverride(fixture: FixtureRow): FixtureOverride | undefined {
    switch (fixture.overrideKind) {
        case null:
            return undefined
        case 'void':
            return { kind: 'void' }
        case 'result':
            return {
                kind: 'result',
                home: requireValue(fixture.overrideHomeGoals, 'override_home_goals', fixture.id),
                away: requireValue(fixture.overrideAwayGoals, 'override_away_goals', fixture.id),
            }
    }
}

function withdrawnFrom(entry: EntryRow): number | undefined {
    if (entry.status !== 'withdrawn') {
        return undefined
    }

    return entry.withdrawnFromWeek ?? 1
}

/** The check constraints make these impossible, so a null here is a real bug. */
function requireValue<T>(value: T | null, column: string, fixtureId: string): T {
    if (value === null) {
        throw new Error(`Fixture ${fixtureId} has no ${column}`)
    }

    return value
}
