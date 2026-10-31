// Created by Claude driven by Eddie Long on 2026-10-31.
//
// The real 2026/27 Premier League fixture list, downloaded once from
// football-data.org and cached in sim/fixtures/. Only the simulator uses it.
// The live site will have its own feed adapter (build step 4).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { z } from 'zod'

import type { Team } from '@/engine'
import { fetchFootballData } from '@/feeds/football-data'
import { crestDirectory } from '@/lib/crests'

import type { Season, SeasonWeek } from './season'
import { slug } from './season'

const DAY_MS = 24 * 60 * 60 * 1000
const SEASON = 2026
/** Relative to the project root. pnpm scripts and the Next.js server both run from there. */
const cacheFile = join(process.cwd(), 'sim', 'fixtures', `pl-${SEASON}.json`)

const cachedMatchSchema = z.object({
    /** The football-data.org match id. Missing from caches made before it was saved. */
    externalId: z.number().int().optional(),
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

export type CachedMatch = z.infer<typeof cachedMatchSchema>

/** The cached matches as saved, for the database seed. */
export function loadCachedMatches(): readonly CachedMatch[] {
    return cacheSchema.parse(JSON.parse(readFileSync(cacheFile, 'utf8'))).matches
}

export function hasCachedSeason(): boolean {
    return existsSync(cacheFile)
}

export interface DownloadSummary {
    readonly fixtures: number
    readonly crests: number
}

/** Downloads the fixture list and every club crest, and saves them. Needs FOOTBALL_DATA_TOKEN. */
export async function downloadSeason(token: string): Promise<DownloadSummary> {
    const feed = await fetchFootballData(token, SEASON)
    const matches = feed.flatMap((match) => {
        const { matchday } = match
        if (matchday === null) {
            return []
        }

        return [{
            externalId: match.externalId,
            matchday,
            utcDate: match.kickoffAt.toISOString(),
            home: match.home.name,
            away: match.away.name,
        }]
    })

    mkdirSync(dirname(cacheFile), { recursive: true })
    writeFileSync(cacheFile, `${JSON.stringify({ season: SEASON, downloadedAt: new Date().toISOString(), matches }, null, 2)}\n`)

    const crestUrls = new Map<string, string>()
    for (const match of feed) {
        for (const team of [match.home, match.away]) {
            if (team.crestUrl !== null) {
                crestUrls.set(slug(team.name), team.crestUrl)
            }
        }
    }

    return { fixtures: matches.length, crests: await downloadCrests(crestUrls) }
}

/** Saves each crest as public/crests/<team-id>.<ext>. The site serves them itself. */
async function downloadCrests(crestUrls: ReadonlyMap<string, string>): Promise<number> {
    mkdirSync(crestDirectory, { recursive: true })
    let saved = 0

    for (const [teamId, url] of crestUrls) {
        const extension = /\.(png|svg|webp)(\?|$)/i.exec(url)?.[1]?.toLowerCase()
        if (extension === undefined) {
            console.warn(`Skipping crest for ${teamId}: unexpected file type in ${url}`)
            continue
        }

        const response = await fetch(url)
        if (!response.ok) {
            console.warn(`Skipping crest for ${teamId}: ${response.status} ${response.statusText}`)
            continue
        }

        writeFileSync(join(crestDirectory, `${teamId}.${extension}`), Buffer.from(await response.arrayBuffer()))
        saved += 1
    }

    return saved
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
