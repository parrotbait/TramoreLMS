// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Creates a competition in the local database, for development.
//
//   pnpm db:seed --start 11              competition only
//   pnpm db:seed --start 11 --players 40 plus 40 fake paid players
//
// Fixtures come from football-data.org when it can be reached, otherwise
// from the cached sim/fixtures file. Refuses to run against a database that
// is not on this machine, unless --allow-remote is given.

import { existsSync } from 'node:fs'
import { parseArgs } from 'node:util'

import { closeDatabase, getDatabase } from '@/db/client'
import type { Database } from '@/db/client'
import { createCompetition } from '@/db/competitions'
import { planCompetition } from '@/db/plan-competition'
import { entries, payments, people } from '@/db/schema'
import { fetchFootballData } from '@/feeds/football-data'
import type { FeedMatch } from '@/feeds/types'
import { displayNameKey } from '@/lib/display-name'

import { hasCachedSeason, loadCachedMatches } from '../sim/real-season'
import { Random } from '../sim/random'
import { playerNames } from '../sim/season'

const SEASON = 2026

const { values } = parseArgs({
    options: {
        'start': { type: 'string', default: '11' },
        'players': { type: 'string', default: '0' },
        'name': { type: 'string' },
        'allow-remote': { type: 'boolean', default: false },
    },
})

async function main(): Promise<number> {
    if (existsSync('.env.local')) {
        process.loadEnvFile('.env.local')
    }

    const url = process.env['POSTGRES_URL'] ?? ''
    if (!isLocal(url) && !values['allow-remote']) {
        console.error('POSTGRES_URL is not a local database. Pass --allow-remote if you really mean it.')
        return 1
    }

    const startMatchday = Number(values.start)
    const playerCount = Number(values.players)
    const matches = await loadMatches()
    const plan = planCompetition(matches, startMatchday)
    const name = values.name ?? `Last Man Standing ${SEASON}/${String(SEASON + 1).slice(2)}`

    const db = getDatabase()
    const competitionId = await createCompetition(db, { name, season: SEASON, startMatchday }, plan)
    if (playerCount > 0) {
        await addFakePlayers(db, competitionId, playerCount)
    }

    console.log(`Created “${name}” (${competitionId})`)
    console.log(`  ${plan.teams.length} teams, ${plan.weeks.length} weeks from PL Matchday ${startMatchday}, ${plan.fixtures.length} fixtures`)
    if (playerCount > 0) {
        console.log(`  ${playerCount} fake paid players`)
    }

    return 0
}

async function loadMatches(): Promise<readonly FeedMatch[]> {
    const token = process.env['FOOTBALL_DATA_TOKEN']
    if (token !== undefined && token !== '') {
        try {
            const live = await fetchFootballData(token, SEASON)
            console.log(`Using the live football-data.org fixture list (${live.length} matches).`)
            return live
        } catch (error) {
            console.warn(`Could not reach football-data.org (${error instanceof Error ? error.message : String(error)}).`)
        }
    }

    if (!hasCachedSeason()) {
        throw new Error('No fixtures: football-data.org is unreachable and there is no cached season. Run pnpm sim --fetch.')
    }

    const cached = loadCachedMatches()
    const missingIds = cached.some((match) => {
        return match.externalId === undefined
    })
    if (missingIds) {
        console.warn('The cached fixtures have no football-data.org ids, so the live sync will not match them.')
        console.warn('Fine for local testing. Run pnpm sim --fetch again to refresh the cache.')
    }

    console.log(`Using the cached fixture list (${cached.length} matches).`)
    return cached.map((match, index) => {
        return {
            externalId: match.externalId ?? -(index + 1),
            matchday: match.matchday,
            kickoffAt: new Date(match.utcDate),
            status: 'scheduled',
            home: { name: match.home, crestUrl: null },
            away: { name: match.away, crestUrl: null },
            score: null,
        }
    })
}

async function addFakePlayers(db: Database, competitionId: string, count: number) {
    const names = playerNames(count, new Random(SEASON))

    await db.transaction(async (tx) => {
        for (const [index, displayName] of names.entries()) {
            const [person] = await tx.insert(people).values({
                email: `dev+${competitionId.slice(0, 8)}-${index + 1}@example.test`,
            }).returning({ id: people.id })
            if (person === undefined) {
                throw new Error('Could not create a fake person.')
            }

            const [entry] = await tx.insert(entries).values({
                competitionId,
                personId: person.id,
                displayName,
                displayNameKey: displayNameKey(displayName),
                status: 'active',
            }).returning({ id: entries.id })
            if (entry === undefined) {
                throw new Error('Could not create a fake entry.')
            }

            await tx.insert(payments).values({
                entryId: entry.id,
                kind: 'entry',
                method: 'cash',
                status: 'paid',
                amountCents: 1000,
                note: 'Fake player from pnpm db:seed',
            })
        }
    })
}

function isLocal(url: string): boolean {
    try {
        const host = new URL(url).hostname
        return host === '' || host === 'localhost' || host === '127.0.0.1' || host === '::1'
    } catch {
        return false
    }
}

main()
    .then((code) => {
        process.exitCode = code
    })
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
    })
    .finally(async () => {
        await closeDatabase()
    })
