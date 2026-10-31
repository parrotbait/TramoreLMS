// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Turns a fixture's feed state and any admin override into a resolution.
// Applies the three postponement cases from rule 5 (Decision 7).

import type { Fixture, TeamId, Week } from './types'

export type FixtureResolution =
    | { readonly kind: 'pending' }
    | { readonly kind: 'result'; readonly home: number; readonly away: number }
    /** Postponed or cancelled after the cut-off, or abandoned without a result. Pickers go through. */
    | { readonly kind: 'void' }
    /** Postponed at or before the cut-off. The fixture is not part of the week. */
    | { readonly kind: 'removed' }

export type TeamResult =
    | 'win'
    | 'draw'
    | 'loss'
    | 'void'
    | 'removed'
    | 'pending'

/**
 * True once the postponement is known at `instant`: recorded at or before it.
 * A postponement at exactly the cut-off therefore counts as before the cut-off.
 */
export function isPostponedBy(fixture: Fixture, instant: Date): boolean {
    if (fixture.state.kind !== 'postponed') {
        return false
    }

    return fixture.state.at.getTime() <= instant.getTime()
}

export function fixtureForTeam(
    weekFixtures: readonly Fixture[],
    teamId: TeamId,
): Fixture | undefined {
    return weekFixtures.find((fixture) => {
        return fixture.homeTeamId === teamId || fixture.awayTeamId === teamId
    })
}

/**
 * Resolves every fixture in one week.
 *
 * An abandoned fixture with no confirmed result stays pending until every
 * other fixture in the week is resolved. Then it becomes void.
 */
export function resolveWeekFixtures(
    week: Week,
    weekFixtures: readonly Fixture[],
): ReadonlyMap<string, FixtureResolution> {
    const resolutions = new Map<string, FixtureResolution>()
    const abandoned: Fixture[] = []

    for (const fixture of weekFixtures) {
        const isUnresolvedAbandoned = fixture.override === undefined && fixture.state.kind === 'abandoned'
        if (isUnresolvedAbandoned) {
            abandoned.push(fixture)
            continue
        }

        resolutions.set(fixture.id, resolveDirect(fixture, week.cutoffAt))
    }

    const restOfWeekResolved = [...resolutions.values()].every((resolution) => {
        return resolution.kind !== 'pending'
    })
    const abandonedResolution: FixtureResolution = restOfWeekResolved ? { kind: 'void' } : { kind: 'pending' }

    for (const fixture of abandoned) {
        resolutions.set(fixture.id, abandonedResolution)
    }

    return resolutions
}

export function teamResult(
    resolution: FixtureResolution,
    fixture: Fixture,
    teamId: TeamId,
): TeamResult {
    switch (resolution.kind) {
        case 'pending':
            return 'pending'
        case 'void':
            return 'void'
        case 'removed':
            return 'removed'
        case 'result':
            break
    }

    const isHome = fixture.homeTeamId === teamId
    const goalsFor = isHome ? resolution.home : resolution.away
    const goalsAgainst = isHome ? resolution.away : resolution.home

    if (goalsFor === goalsAgainst) {
        return 'draw'
    }

    return goalsFor > goalsAgainst ? 'win' : 'loss'
}

function resolveDirect(fixture: Fixture, cutoffAt: Date | null): FixtureResolution {
    if (fixture.override !== undefined) {
        switch (fixture.override.kind) {
            case 'void':
                return { kind: 'void' }
            case 'result':
                return { kind: 'result', home: fixture.override.home, away: fixture.override.away }
        }
    }

    switch (fixture.state.kind) {
        case 'scheduled':
        case 'abandoned':
            return { kind: 'pending' }
        case 'postponed':
            return postponedResolution(fixture, cutoffAt)
        case 'finished':
            return { kind: 'result', home: fixture.state.home, away: fixture.state.away }
    }
}

function postponedResolution(fixture: Fixture, cutoffAt: Date | null): FixtureResolution {
    if (cutoffAt === null || isPostponedBy(fixture, cutoffAt)) {
        return { kind: 'removed' }
    }

    return { kind: 'void' }
}
