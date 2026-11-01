// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Command-line only: downloads the 2026/27 fixture list and club crests from
// football-data.org, and reads the cache from disk. The website must not
// import this file. It uses season-cache.ts with an imported JSON file.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { fetchFootballData } from '@/feeds/football-data'
import { slug } from '@/lib/slug'

import type { Season } from './season'
import { matchesFromCache, seasonFromCache } from './season-cache'
import type { CachedMatch } from './season-cache'

const SEASON = 2026
const projectRoot = process.cwd()
const cacheFile = join(projectRoot, 'sim', 'fixtures', `pl-${SEASON}.json`)
const crestDirectory = join(projectRoot, 'public', 'crests')
const crestManifestFile = join(projectRoot, 'src', 'lib', 'crest-manifest.json')

export type { CachedMatch }

export function hasCachedSeason(): boolean {
    return existsSync(cacheFile)
}

export function loadCachedSeason(): Season {
    return seasonFromCache(JSON.parse(readFileSync(cacheFile, 'utf8')))
}

/** The cached matches as saved, for the database seed. */
export function loadCachedMatches(): readonly CachedMatch[] {
    return matchesFromCache(JSON.parse(readFileSync(cacheFile, 'utf8')))
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

    mkdirSync(join(projectRoot, 'sim', 'fixtures'), { recursive: true })
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

/**
 * Saves each crest as public/crests/<team-slug>.<ext>, then writes the
 * manifest the website imports (src/lib/crest-manifest.json).
 */
async function downloadCrests(crestUrls: ReadonlyMap<string, string>): Promise<number> {
    mkdirSync(crestDirectory, { recursive: true })
    const manifest: Record<string, string> = {}

    for (const [teamSlug, url] of crestUrls) {
        const extension = /\.(png|svg|webp)(\?|$)/i.exec(url)?.[1]?.toLowerCase()
        if (extension === undefined) {
            console.warn(`Skipping crest for ${teamSlug}: unexpected file type in ${url}`)
            continue
        }

        const response = await fetch(url)
        if (!response.ok) {
            console.warn(`Skipping crest for ${teamSlug}: ${response.status} ${response.statusText}`)
            continue
        }

        const fileName = `${teamSlug}.${extension}`
        writeFileSync(join(crestDirectory, fileName), Buffer.from(await response.arrayBuffer()))
        manifest[teamSlug] = `/crests/${fileName}`
    }

    const sorted = Object.fromEntries(Object.entries(manifest).sort(([left], [right]) => {
        return left.localeCompare(right)
    }))
    writeFileSync(crestManifestFile, `${JSON.stringify(sorted, null, 4)}\n`)

    return Object.keys(manifest).length
}
