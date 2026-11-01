// Created by Claude driven by Eddie Long on 2026-11-01.
//
// Reads the cached 2026/27 fixture list (sim/fixtures/pl-2026.json). Pure:
// callers pass the parsed JSON in, so the website can import the file and
// never touches the file system.

import { z } from 'zod'

import type { Team } from '@/engine'
import { slug } from '@/lib/slug'

import type { Season, SeasonWeek } from './season'

const DAY_MS = 24 * 60 * 60 * 1000

const cachedMatchSchema = z.object({
    /** The football-data.org match id. Missing from caches made before it was saved. */
    externalId: z.number().int().optional(),
    matchday: z.number().int(),
    utcDate: z.string(),
    home: z.string(),
    away: z.string(),
})

export const cacheSchema = z.object({
    season: z.number(),
    downloadedAt: z.string(),
    matches: z.array(cachedMatchSchema),
})

export type CachedMatch = z.infer<typeof cachedMatchSchema>

export function matchesFromCache(json: unknown): readonly CachedMatch[] {
    return cacheSchema.parse(json).matches
}

/**
 * Builds a season from the cache. A match rearranged to more than 4 days
 * after the start of its matchday is left out, as it would be postponed.
 */
export function seasonFromCache(json: unknown): Season {
    const cache = cacheSchema.parse(json)
    const names = new Set(cache.matches.flatMap((match) => {
        return [match.home, match.away]
    }))
    const teams: Team[] = [...names].sort().map((name) => {
        return { id: slug(name), fullName: name }
    })

    const matchdays: SeasonWeek[] = []
    for (let plMatchday = 1; plMatchday <= 38; plMatchday += 1) {
        const matches = cache.matches.filter((match) => {
            return match.matchday === plMatchday
        })
        const firstKickoff = Math.min(...matches.map((match) => {
            return Date.parse(match.utcDate)
        }))

        matchdays.push({
            plMatchday,
            fixtures: matches
                .filter((match) => {
                    return Date.parse(match.utcDate) - firstKickoff <= 4 * DAY_MS
                })
                .map((match) => {
                    return {
                        homeTeamId: slug(match.home),
                        awayTeamId: slug(match.away),
                        kickoffAt: new Date(match.utcDate),
                    }
                }),
        })
    }

    return { teams, matchdays }
}
