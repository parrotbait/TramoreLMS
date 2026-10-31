// Created by Claude driven by Eddie Long on 2026-10-31.
//
// football-data.org, the primary feed (Decision 3).
// https://www.football-data.org/documentation/api

import { z } from 'zod'

import { canonicalTeamName } from './team-names'
import type { FeedMatch, FeedStatus } from './types'

const API_BASE = 'https://api.football-data.org/v4'

const teamSchema = z.object({
    id: z.number().int().nullable().optional(),
    name: z.string().nullable(),
    crest: z.string().nullable().optional(),
})

const matchSchema = z.object({
    id: z.number().int(),
    matchday: z.number().int().nullable(),
    utcDate: z.string(),
    status: z.string(),
    homeTeam: teamSchema,
    awayTeam: teamSchema,
    score: z.object({
        fullTime: z.object({
            home: z.number().int().nullable(),
            away: z.number().int().nullable(),
        }),
    }),
})

const responseSchema = z.object({ matches: z.array(matchSchema) })

export type FootballDataResponse = z.input<typeof responseSchema>

/**
 * football-data.org statuses:
 * SCHEDULED and TIMED (not played), IN_PLAY and PAUSED (playing),
 * FINISHED and AWARDED (result), POSTPONED, CANCELLED, SUSPENDED (stopped).
 */
export function mapFootballDataStatus(status: string): FeedStatus {
    switch (status) {
        case 'IN_PLAY':
        case 'PAUSED':
        case 'LIVE':
            return 'inPlay'
        case 'FINISHED':
        case 'AWARDED':
            return 'finished'
        case 'POSTPONED':
            return 'postponed'
        case 'CANCELLED':
            return 'cancelled'
        case 'SUSPENDED':
            return 'abandoned'
        default:
            return 'scheduled'
    }
}

/** Parses a /competitions/PL/matches response. Matches without both teams are skipped. */
export function parseFootballData(body: unknown): readonly FeedMatch[] {
    const parsed = responseSchema.parse(body)

    return parsed.matches.flatMap((match): FeedMatch[] => {
        const homeName = match.homeTeam.name
        const awayName = match.awayTeam.name
        if (homeName === null || awayName === null) {
            return []
        }

        const status = mapFootballDataStatus(match.status)
        const { home, away } = match.score.fullTime
        const score = status === 'finished' && home !== null && away !== null ? { home, away } : null

        return [{
            externalId: match.id,
            matchday: match.matchday,
            kickoffAt: new Date(match.utcDate),
            status,
            home: { name: canonicalTeamName(homeName), crestUrl: match.homeTeam.crest ?? null },
            away: { name: canonicalTeamName(awayName), crestUrl: match.awayTeam.crest ?? null },
            score,
        }]
    })
}

export async function fetchFootballData(
    token: string,
    season: number,
    fetchImpl: typeof fetch = fetch,
): Promise<readonly FeedMatch[]> {
    const response = await fetchImpl(`${API_BASE}/competitions/PL/matches?season=${season}`, {
        headers: { 'X-Auth-Token': token },
        cache: 'no-store',
    })
    if (!response.ok) {
        throw new Error(`football-data.org returned ${response.status} ${response.statusText}`)
    }

    return parseFootballData(await response.json())
}
