// Created by Claude driven by Eddie Long on 2026-10-31.
//
// The real 2026/27 Premier League fixture list, downloaded once from
// football-data.org and cached in sim/fixtures/. Only the simulator uses it.
// The live site will have its own feed adapter (build step 4).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

import type { Team } from '@/engine'
import { canonicalTeamName } from '@/feeds/team-names'

import type { Season, SeasonWeek } from './season'
import { slug } from './season'

const DAY_MS = 24 * 60 * 60 * 1000
const SEASON = 2026
const cacheFile = fileURLToPath(new URL(`./fixtures/pl-${SEASON}.json`, import.meta.url))

const cachedMatchSchema = z.object({
    matchday: z.number().int(),
    utcDate: z.string(),
    home: z.string(),
    away: z.string(),
})

const cacheSchema = z.object({
    season: z.number(),
    downloadedAt: z.string(),
    matches: z.array(cachedMatchSchema),
})

const apiSchema = z.object({
    matches: z.array(z.object({
        matchday: z.number().int().nullable(),
        utcDate: z.string(),
        homeTeam: z.object({ name: z.string().nullable() }),
        awayTeam: z.object({ name: z.string().nullable() }),
    })),
})

export function hasCachedSeason(): boolean {
    return existsSync(cacheFile)
}

/** Downloads the fixture list and saves it. Needs FOOTBALL_DATA_TOKEN. */
export async function downloadSeason(token: string): Promise<number> {
    const response = await fetch(`https://api.football-data.org/v4/competitions/PL/matches?season=${SEASON}`, {
        headers: { 'X-Auth-Token': token },
    })
    if (!response.ok) {
        throw new Error(`football-data.org returned ${response.status} ${response.statusText}`)
    }

    const parsed = apiSchema.parse(await response.json())
    const matches = parsed.matches.flatMap((match) => {
        const { matchday } = match
        const home = match.homeTeam.name
        const away = match.awayTeam.name
        if (matchday === null || home === null || away === null) {
            return []
        }

        return [{ matchday, utcDate: match.utcDate, home: canonicalTeamName(home), away: canonicalTeamName(away) }]
    })

    mkdirSync(dirname(cacheFile), { recursive: true })
    writeFileSync(cacheFile, `${JSON.stringify({ season: SEASON, downloadedAt: new Date().toISOString(), matches }, null, 2)}\n`)

    return matches.length
}

/**
 * Loads the cached season. A match rearranged to more than 4 days after the
 * start of its matchday is left out, as it would be postponed in real life.
 */
export function loadCachedSeason(): Season {
    const cache = cacheSchema.parse(JSON.parse(readFileSync(cacheFile, 'utf8')))
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
