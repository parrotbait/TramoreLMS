// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Season data for the simulator: a synthetic 20-team season that works
// offline, and player names.

import type { Team } from '@/engine'
import { weekStart } from '@/engine/testing/builder'

import type { FixtureSeed } from './competition'
import type { Random } from './random'

const HOUR_MS = 60 * 60 * 1000

export interface SeasonWeek {
    readonly plMatchday: number
    readonly fixtures: readonly FixtureSeed[]
}

export interface Season {
    readonly teams: readonly Team[]
    /** Indexed by PL matchday - 1. */
    readonly matchdays: readonly SeasonWeek[]
}

const SYNTHETIC_TEAMS = [
    'Arsenal',
    'Aston Villa',
    'Bournemouth',
    'Brentford',
    'Brighton & Hove Albion',
    'Burnley',
    'Chelsea',
    'Crystal Palace',
    'Everton',
    'Fulham',
    'Leeds United',
    'Liverpool',
    'Manchester City',
    'Manchester United',
    'Newcastle United',
    'Nottingham Forest',
    'Sunderland',
    'Tottenham Hotspur',
    'West Ham United',
    'Wolverhampton Wanderers',
] as const

/** Saturday 12:30, 15:00 ×4, 17:30, Sunday 14:00 ×2 and 16:30, Monday 20:00. Offsets from Saturday 12:30 UTC. */
const KICKOFF_OFFSETS_HOURS = [0, 2.5, 2.5, 2.5, 2.5, 5, 25.5, 25.5, 28, 55.5] as const

const FIRST_NAMES = [
    'Aoife',
    'Seán',
    'Niamh',
    'Ciarán',
    'Siobhán',
    'Pádraig',
    'Gráinne',
    'Darragh',
    'Orla',
    'Eoin',
    'Clodagh',
    'Cillian',
    'Róisín',
    'Fionn',
    'Saoirse',
    'Oisín',
    'Méabh',
    'Tadhg',
    'Caoimhe',
    'Rory',
] as const

/**
 * A 38-matchday double round robin (circle method). Competition week n is
 * played in the week of `weekStart(n)`, so dates line up with the test builder.
 */
export function syntheticSeason(startMatchday: number): Season {
    const teams: Team[] = SYNTHETIC_TEAMS.map((name) => {
        return { id: slug(name), fullName: name }
    })
    const ids = teams.map((team) => {
        return team.id
    })
    const rounds = roundRobin(ids)
    const matchdays: SeasonWeek[] = []

    for (let index = 0; index < 38; index += 1) {
        const plMatchday = index + 1
        const firstHalf = index < rounds.length
        const pairs = rounds[index % rounds.length] ?? []
        const competitionWeek = plMatchday - startMatchday + 1
        const saturday = weekStart(competitionWeek).getTime()

        matchdays.push({
            plMatchday,
            fixtures: pairs.map(([home, away], pairIndex) => {
                const offset = KICKOFF_OFFSETS_HOURS[pairIndex] ?? 0
                return {
                    homeTeamId: firstHalf ? home : away,
                    awayTeamId: firstHalf ? away : home,
                    kickoffAt: new Date(saturday + offset * HOUR_MS),
                }
            }),
        })
    }

    return { teams, matchdays }
}

/** Unique single-word player names, so they are easy to type in interactive mode. */
export function playerNames(count: number, random: Random): readonly string[] {
    const names: string[] = []
    const used = new Map<string, number>()

    for (let index = 0; index < count; index += 1) {
        const first = random.choose(FIRST_NAMES)
        const seen = (used.get(first) ?? 0) + 1
        used.set(first, seen)
        names.push(seen === 1 ? first : `${first}${seen}`)
    }

    return names
}

export function slug(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
}

function roundRobin(ids: readonly string[]): (readonly [string, string])[][] {
    const rotating = ids.slice(1)
    const fixed = ids[0]
    if (fixed === undefined) {
        return []
    }

    const rounds: (readonly [string, string])[][] = []
    for (let round = 0; round < ids.length - 1; round += 1) {
        const order = [fixed, ...rotating]
        const pairs: (readonly [string, string])[] = []

        for (let index = 0; index < order.length / 2; index += 1) {
            const left = order[index]
            const right = order[order.length - 1 - index]
            if (left === undefined || right === undefined) {
                continue
            }

            pairs.push(round % 2 === 0 ? [left, right] : [right, left])
        }

        rounds.push(pairs)
        const last = rotating.pop()
        if (last !== undefined) {
            rotating.unshift(last)
        }
    }

    return rounds
}
