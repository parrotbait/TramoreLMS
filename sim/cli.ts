// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Season simulator. Uses the real rules engine.
//
//   pnpm sim --players 30 --start 11 --seed 42      random results, reproducible
//   pnpm sim --players 30 --start 11 --interactive  you type each result
//   pnpm sim --scenario sim/scenarios/x.yaml        run one scenario file
//   pnpm sim --fetch                                download the real fixture list
//   pnpm sim ... --synthetic                        made-up season, works offline
//   pnpm sim ... --verbose                          show every player and result

import { existsSync, readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

import { interactiveDriver } from './interactive'
import { LinePrompt } from './prompt'
import { randomDriver } from './random-driver'
import { downloadSeason, hasCachedSeason, loadCachedSeason } from './real-season'
import { describeOutcome, describeWeek } from './report'
import { parseScenario, runScenario } from './scenario'
import { syntheticSeason } from './season'
import type { Season } from './season'
import { simulateSeason } from './simulate'

const USAGE = `Season simulator

  pnpm sim --players 30 --start 11 --seed 42      random results, reproducible
  pnpm sim --players 30 --start 11 --interactive  you type each result
  pnpm sim --scenario sim/scenarios/x.yaml        run one scenario file
  pnpm sim --fetch                                download the real fixture list

Options:
  --synthetic   made-up 20-team season, works offline
  --verbose     show every player and result
  --prize 300   prize in euro`

const { values } = parseArgs({
    options: {
        players: { type: 'string', default: '30' },
        start: { type: 'string', default: '11' },
        seed: { type: 'string' },
        prize: { type: 'string', default: '300' },
        scenario: { type: 'string' },
        synthetic: { type: 'boolean', default: false },
        interactive: { type: 'boolean', default: false },
        verbose: { type: 'boolean', default: false },
        fetch: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
    },
})

async function main(): Promise<number> {
    if (values.help) {
        console.log(USAGE)
        return 0
    }

    if (values.fetch) {
        return fetchFixtures()
    }

    if (values.scenario !== undefined) {
        return runScenarioFile(values.scenario)
    }

    return runSeason()
}

async function fetchFixtures(): Promise<number> {
    if (existsSync('.env.local')) {
        process.loadEnvFile('.env.local')
    }

    const token = process.env['FOOTBALL_DATA_TOKEN']
    if (token === undefined || token === '') {
        console.error('FOOTBALL_DATA_TOKEN is not set. Add it to .env.local.')
        return 1
    }

    const summary = await downloadSeason(token)
    console.log(`Saved ${summary.fixtures} fixtures to sim/fixtures/ and ${summary.crests} crests to public/crests/.`)
    return 0
}

async function runScenarioFile(path: string): Promise<number> {
    const run = await runScenario(parseScenario(readFileSync(path, 'utf8'), path))
    console.log(run.report)

    if (run.failures.length === 0) {
        console.log('\n✓ Every expectation held.')
        return 0
    }

    console.log('\n✗ Expectations that failed:')
    for (const failure of run.failures) {
        console.log(`  ${failure}`)
    }
    return 1
}

async function runSeason(): Promise<number> {
    const players = Number(values.players)
    const start = Number(values.start)
    const prizeCents = Math.round(Number(values.prize) * 100)
    const seed = values.seed === undefined ? Math.floor(Math.random() * 1_000_000) : Number(values.seed)

    if (!Number.isInteger(players) || players < 1 || !Number.isInteger(start) || start < 1 || start > 38) {
        console.error('--players must be at least 1, and --start must be a matchday from 1 to 38.')
        return 1
    }

    const season = chooseSeason(start)
    const prompt = values.interactive ? new LinePrompt() : undefined
    const verbose = values.verbose || prompt !== undefined

    console.log(`${players} players · starting PL Matchday ${start} · seed ${seed}`)

    try {
        const result = await simulateSeason({
            season,
            players,
            startMatchday: start,
            seed,
            makeDriver: (weekNumber, fixtures, random) => {
                return prompt === undefined
                    ? randomDriver(weekNumber, fixtures, random)
                    : interactiveDriver(weekNumber, fixtures, random, prompt)
            },
            onWeek: (competition, log, standings, plMatchday) => {
                console.log(describeWeek(competition, log, standings, { verbose, plMatchday }))
            },
        })

        console.log(describeOutcome(result.standings, prizeCents))
    } finally {
        prompt?.close()
    }

    console.log(`\nReplay this season with --seed ${seed}`)
    return 0
}

function chooseSeason(start: number): Season {
    if (values.synthetic) {
        return syntheticSeason(start)
    }

    if (!hasCachedSeason()) {
        console.log('No real fixtures cached yet, so using a synthetic season. Run "pnpm sim --fetch" to download them.')
        return syntheticSeason(start)
    }

    return loadCachedSeason()
}

main()
    .then((code) => {
        process.exitCode = code
    })
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
    })
