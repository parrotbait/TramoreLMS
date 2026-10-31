// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Rough team strength, so simulated results and picks look like a real
// season: favourites win more often, and players prefer them.
// Ratings are on a 0-100 scale. Unknown teams (promoted sides) get 45.

import type { Fixture, TeamId } from '@/engine'

import type { Random } from './random'
import { slug } from './season'

const DEFAULT_RATING = 45
const HOME_ADVANTAGE = 5

const RATINGS: Readonly<Record<string, number>> = {
    'Arsenal': 88,
    'Liverpool': 87,
    'Manchester City': 86,
    'Chelsea': 80,
    'Newcastle United': 74,
    'Aston Villa': 72,
    'Tottenham Hotspur': 70,
    'Manchester United': 68,
    'Brighton & Hove Albion': 66,
    'Nottingham Forest': 64,
    'Bournemouth': 62,
    'Crystal Palace': 61,
    'Brentford': 60,
    'Fulham': 58,
    'Everton': 55,
    'West Ham United': 54,
    'Wolverhampton Wanderers': 48,
    'Leeds United': 47,
    'Burnley': 42,
    'Sunderland': 44,
}

const ratingsById = new Map(Object.entries(RATINGS).map(([name, rating]) => {
    return [slug(name), rating] as const
}))

export function ratingOf(teamId: TeamId): number {
    return ratingsById.get(teamId) ?? DEFAULT_RATING
}

export interface MatchOdds {
    readonly home: number
    readonly draw: number
    readonly away: number
}

/** About 45% home, 25% draw, 30% away for evenly matched sides. */
export function oddsOf(fixture: Fixture): MatchOdds {
    const difference = ratingOf(fixture.homeTeamId) - ratingOf(fixture.awayTeamId) + HOME_ADVANTAGE
    const home = clamp(0.40 + difference * 0.012, 0.08, 0.82)
    const away = clamp(0.35 - difference * 0.012, 0.05, 0.78)

    return { home, away, draw: Math.max(0, 1 - home - away) }
}

export function winChance(fixture: Fixture, teamId: TeamId): number {
    const odds = oddsOf(fixture)
    return teamId === fixture.homeTeamId ? odds.home : odds.away
}

export function randomScoreFor(fixture: Fixture, random: Random): { home: number; away: number } {
    const odds = oddsOf(fixture)
    const roll = random.next()

    if (roll < odds.home) {
        const home = random.int(1, 4)
        return { home, away: random.int(0, home - 1) }
    }

    if (roll < odds.home + odds.draw) {
        const goals = random.int(0, 2)
        return { home: goals, away: goals }
    }

    const away = random.int(1, 3)
    return { home: random.int(0, away - 1), away }
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}
