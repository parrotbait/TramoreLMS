// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Shared input for every view model. The preview builds one from the
// simulator. The real pages will build one from the database.

import type { EntryId, Fixture, GameState, Standings, TeamId } from '@/engine'

export interface ViewContext {
    readonly state: GameState
    readonly standings: Standings
    readonly now: Date
    readonly nameOf: (entryId: EntryId) => string
    readonly plMatchdayOf: (weekNumber: number) => number
    /** Public URL of the club crest, or `null` to show initials. */
    readonly crestOf: (teamId: TeamId) => string | null
}

export function teamNameOf(context: ViewContext, teamId: TeamId | null): string {
    if (teamId === null) {
        return 'Pass'
    }

    return context.state.teams.find((team) => {
        return team.id === teamId
    })?.fullName ?? teamId
}

export function fixturesOf(context: ViewContext, weekNumber: number): readonly Fixture[] {
    return context.state.fixtures
        .filter((fixture) => {
            return fixture.week === weekNumber
        })
        .sort((left, right) => {
            return left.kickoffAt.getTime() - right.kickoffAt.getTime()
        })
}

export function fixtureLabelOf(context: ViewContext, fixture: Fixture): string {
    return `${teamNameOf(context, fixture.homeTeamId)} v ${teamNameOf(context, fixture.awayTeamId)}`
}

/** For example “2–1”, “Postponed”, “Void (admin)”, or `null` when not played yet. */
export function fixtureScoreLabel(fixture: Fixture): string | null {
    if (fixture.override !== undefined) {
        return fixture.override.kind === 'void'
            ? 'Void (admin)'
            : `${fixture.override.home}–${fixture.override.away}`
    }

    switch (fixture.state.kind) {
        case 'scheduled':
            return null
        case 'postponed':
            return 'Postponed'
        case 'abandoned':
            return 'Abandoned'
        case 'finished':
            return `${fixture.state.home}–${fixture.state.away}`
    }
}
