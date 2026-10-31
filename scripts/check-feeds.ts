// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Checks both live feeds against each other. Run from a normal terminal:
//
//   pnpm feed:check
//
// Reports match counts, FPL team names we cannot map, how many fixtures pair
// up between the feeds, and finished results where the scores disagree.

import { existsSync } from 'node:fs'

import { fetchFootballData } from '@/feeds/football-data'
import { fetchFpl } from '@/feeds/fpl'

const SEASON = 2026

async function main(): Promise<number> {
    if (existsSync('.env.local')) {
        process.loadEnvFile('.env.local')
    }

    const token = process.env['FOOTBALL_DATA_TOKEN']
    if (token === undefined || token === '') {
        console.error('FOOTBALL_DATA_TOKEN is not set. Add it to .env.local.')
        return 1
    }

    const primary = await fetchFootballData(token, SEASON)
    const ourNames = [...new Set(primary.flatMap((match) => {
        return [match.home.name, match.away.name]
    }))].sort()
    const secondary = await fetchFpl(ourNames)

    console.log(`football-data.org: ${primary.length} matches, ${ourNames.length} teams`)
    console.log(`FPL:               ${secondary.matches.length} matches`)

    if (secondary.unmappedTeams.length > 0) {
        console.log(`\n✗ FPL teams we cannot map: ${secondary.unmappedTeams.join(', ')}`)
        console.log('  Add them to FPL_ALIASES in src/feeds/fpl.ts.')
    }

    const fplByTeams = new Map(secondary.matches.map((match) => {
        return [`${match.home.name}|${match.away.name}`, match] as const
    }))
    let paired = 0
    const disagreements: string[] = []

    for (const match of primary) {
        const other = fplByTeams.get(`${match.home.name}|${match.away.name}`)
        if (other === undefined) {
            continue
        }

        paired += 1
        const bothFinished = match.score !== null && other.score !== null
        const isDifferent = bothFinished
            && (match.score?.home !== other.score?.home || match.score?.away !== other.score?.away)
        if (isDifferent) {
            disagreements.push(`  ${match.home.name} v ${match.away.name}: ${scoreText(match.score)} vs FPL ${scoreText(other.score)}`)
        }
    }

    console.log(`\nPaired between feeds: ${paired} of ${primary.length}`)
    if (disagreements.length > 0) {
        console.log(`✗ Finished results that disagree (${disagreements.length}):`)
        console.log(disagreements.join('\n'))
    }

    const isHealthy = secondary.unmappedTeams.length === 0 && disagreements.length === 0
    console.log(isHealthy ? '\n✓ Both feeds line up.' : '\n✗ See the problems above.')

    return isHealthy ? 0 : 1
}

function scoreText(score: { readonly home: number; readonly away: number } | null): string {
    if (score === null) {
        return 'no score'
    }

    return `${score.home}-${score.away}`
}

main()
    .then((code) => {
        process.exitCode = code
    })
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
    })
