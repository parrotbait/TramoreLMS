// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Fantasy Premier League API, the cross-check feed (Decision 3).
// Unofficial and undocumented, so everything is parsed defensively.
//   /api/bootstrap-static/  teams (id, name)
//   /api/fixtures/          every fixture of the season

import { z } from 'zod'

import type { FeedMatch, FeedStatus } from './types'

const API_BASE = 'https://fantasy.premierleague.com/api'

/** FPL's short names, mapped to ours (Decision 8). */
const FPL_ALIASES: Readonly<Record<string, string>> = {
    'Brighton': 'Brighton & Hove Albion',
    'Coventry': 'Coventry City',
    'Hull': 'Hull City',
    'Ipswich': 'Ipswich Town',
    'Leeds': 'Leeds United',
    'Leicester': 'Leicester City',
    'Man City': 'Manchester City',
    'Man Utd': 'Manchester United',
    'Newcastle': 'Newcastle United',
    'Nott\'m Forest': 'Nottingham Forest',
    'Spurs': 'Tottenham Hotspur',
    'West Ham': 'West Ham United',
    'Wolves': 'Wolverhampton Wanderers',
}

const bootstrapSchema = z.object({
    teams: z.array(z.object({
        id: z.number().int(),
        name: z.string(),
    })),
})

const fixturesSchema = z.array(z.object({
    id: z.number().int(),
    event: z.number().int().nullable(),
    kickoff_time: z.string().nullable(),
    team_h: z.number().int(),
    team_a: z.number().int(),
    team_h_score: z.number().int().nullable(),
    team_a_score: z.number().int().nullable(),
    started: z.boolean().nullable().optional(),
    finished: z.boolean(),
}))

export type FplBootstrap = z.input<typeof bootstrapSchema>
export type FplFixtures = z.input<typeof fixturesSchema>

export interface FplParseResult {
    readonly matches: readonly FeedMatch[]
    /** FPL team names we could not map. Fix FPL_ALIASES if this is not empty. */
    readonly unmappedTeams: readonly string[]
}

/**
 * Maps FPL's team name to ours: the alias table first, then an exact match,
 * then a unique match on the first word ("Arsenal", "Chelsea" …).
 */
export function mapFplTeamName(fplName: string, ourNames: readonly string[]): string | null {
    const alias = FPL_ALIASES[fplName]
    if (alias !== undefined) {
        return alias
    }

    if (ourNames.includes(fplName)) {
        return fplName
    }

    const candidates = ourNames.filter((name) => {
        return name.toLowerCase().startsWith(fplName.toLowerCase())
    })
    if (candidates.length !== 1) {
        return null
    }

    return candidates[0] ?? null
}

/** FPL only says started or finished. Postponements show up as a missing kick-off time. */
export function parseFpl(bootstrap: unknown, fixtures: unknown, ourNames: readonly string[]): FplParseResult {
    const teams = bootstrapSchema.parse(bootstrap).teams
    const unmappedTeams: string[] = []
    const nameById = new Map<number, string>()

    for (const team of teams) {
        const name = mapFplTeamName(team.name, ourNames)
        if (name === null) {
            unmappedTeams.push(team.name)
            continue
        }

        nameById.set(team.id, name)
    }

    const matches = fixturesSchema.parse(fixtures).flatMap((fixture): FeedMatch[] => {
        const home = nameById.get(fixture.team_h)
        const away = nameById.get(fixture.team_a)
        if (home === undefined || away === undefined || fixture.kickoff_time === null) {
            return []
        }

        const homeScore = fixture.team_h_score
        const awayScore = fixture.team_a_score
        const status: FeedStatus = fixture.finished ? 'finished' : fixture.started === true ? 'inPlay' : 'scheduled'

        return [{
            externalId: fixture.id,
            matchday: fixture.event,
            kickoffAt: new Date(fixture.kickoff_time),
            status,
            home: { name: home, crestUrl: null },
            away: { name: away, crestUrl: null },
            score: fixture.finished && homeScore !== null && awayScore !== null
                ? { home: homeScore, away: awayScore }
                : null,
        }]
    })

    return { matches, unmappedTeams }
}

export async function fetchFpl(ourNames: readonly string[], fetchImpl: typeof fetch = fetch): Promise<FplParseResult> {
    const [bootstrap, fixtures] = await Promise.all([
        getJson(`${API_BASE}/bootstrap-static/`, fetchImpl),
        getJson(`${API_BASE}/fixtures/`, fetchImpl),
    ])

    return parseFpl(bootstrap, fixtures, ourNames)
}

async function getJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
    const response = await fetchImpl(url, { cache: 'no-store' })
    if (!response.ok) {
        throw new Error(`FPL returned ${response.status} ${response.statusText} for ${url}`)
    }

    return response.json()
}
