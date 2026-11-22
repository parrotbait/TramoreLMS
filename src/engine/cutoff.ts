// Created by Claude driven by Eddie Long on 2026-10-31.

import type { Fixture } from './types'
import { hasKickedOffBy, isPostponedBy } from './fixtures'

const ONE_HOUR_MS = 60 * 60 * 1000

/**
 * The cut-off is 1 hour before the earliest kick-off still to come.
 *
 * Call this once, when the week opens, and store the result. The cut-off is
 * fixed from then on (Decision 12). Fixtures already postponed at `asOf` are
 * ignored. So are games that have already kicked off at `asOf`, for example a
 * game that was brought forward by weeks: its team can no longer be picked, and
 * it must not pull the cut-off into the past.
 */
export function computeCutoff(weekFixtures: readonly Fixture[], asOf: Date): Date | null {
    const kickoffs = weekFixtures
        .filter((fixture) => {
            return !isPostponedBy(fixture, asOf) && !hasKickedOffBy(fixture, asOf)
        })
        .map((fixture) => {
            return fixture.kickoffAt.getTime()
        })

    if (kickoffs.length === 0) {
        return null
    }

    return new Date(Math.min(...kickoffs) - ONE_HOUR_MS)
}
