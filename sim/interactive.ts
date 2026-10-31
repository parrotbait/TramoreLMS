// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Interactive mode: players still pick at random, but you type each result
// and can apply admin overrides after the results are in.

import type { Fixture, FixtureOverride, Verdict } from '@/engine'

import type { FixtureSeed, SimCompetition } from './competition'
import type { LinePrompt } from './prompt'
import type { Random } from './random'
import { fixtureLabel, randomDriver } from './random-driver'
import { randomScoreFor } from './strength'
import type { PlannedResult, WeekDriver } from './week'

const SCORE_PATTERN = /^(\d+)-(\d+)$/

export function interactiveDriver(
    weekNumber: number,
    fixtures: readonly FixtureSeed[],
    random: Random,
    prompt: LinePrompt,
): WeekDriver {
    const base = randomDriver(weekNumber, fixtures, random)

    return {
        ...base,
        results: async (competition, weekFixtures) => {
            console.log(`\nWeek ${weekNumber} results. Enter = random, 2-1 = score, d = draw, p = postponed, a = abandoned.`)
            const results = new Map<string, PlannedResult>()

            for (const fixture of weekFixtures) {
                if (fixture.state.kind !== 'scheduled') {
                    console.log(`  ${fixtureLabel(competition, fixture)}: postponed before the cut-off`)
                    continue
                }

                results.set(fixture.id, await askResult(prompt, competition, fixture, random))
            }

            return results
        },
        afterResults: async (competition) => {
            await askOverrides(prompt, competition, weekNumber)
        },
    }
}

async function askResult(
    prompt: LinePrompt,
    competition: SimCompetition,
    fixture: Fixture,
    random: Random,
): Promise<PlannedResult> {
    const label = `${fixtureLabel(competition, fixture)}${pickersOf(competition, fixture)}`

    for (;;) {
        const answer = (await prompt.question(`  ${label}: `)).trim().toLowerCase()
        const result = parseAnswer(answer, fixture, random)
        if (result !== undefined) {
            return result
        }

        console.log('    Try again: Enter, 2-1, d, p or a.')
    }
}

function parseAnswer(answer: string, fixture: Fixture, random: Random): PlannedResult | undefined {
    switch (answer) {
        case '': {
            const score = randomScoreFor(fixture, random)
            return { kind: 'score', primary: score, secondary: score }
        }
        case 'd': {
            const goals = random.int(0, 3)
            const score = { home: goals, away: goals }
            return { kind: 'score', primary: score, secondary: score }
        }
        case 'p':
            return { kind: 'postponedLate' }
        case 'a':
            return { kind: 'abandoned' }
        default:
            break
    }

    const match = SCORE_PATTERN.exec(answer)
    if (match === null) {
        return undefined
    }

    const score = { home: Number(match[1]), away: Number(match[2]) }
    return { kind: 'score', primary: score, secondary: score }
}

async function askOverrides(prompt: LinePrompt, competition: SimCompetition, weekNumber: number) {
    console.log('  Overrides: "pick <player> through|out", "fixture <team> <2-1|void>", or Enter to carry on.')

    for (;;) {
        const line = (await prompt.question('  override> ')).trim()
        if (line === '') {
            return
        }

        const message = applyOverride(line, competition, weekNumber)
        console.log(`    ${message}`)
    }
}

function applyOverride(line: string, competition: SimCompetition, weekNumber: number): string {
    const [command, ...rest] = line.split(/\s+/)
    const last = rest.at(-1) ?? ''
    const subject = rest.slice(0, -1).join(' ')

    switch (command) {
        case 'pick':
            return overridePick(competition, weekNumber, subject, last)
        case 'fixture':
            return overrideFixture(competition, weekNumber, subject, last)
        default:
            return `Unknown command "${command ?? ''}".`
    }
}

function overridePick(competition: SimCompetition, weekNumber: number, entryId: string, outcome: string): string {
    const isKnownEntry = competition.state.entries.some((entry) => {
        return entry.id === entryId
    })
    if (!isKnownEntry) {
        return `No player called "${entryId}".`
    }

    if (outcome !== 'through' && outcome !== 'out') {
        return 'The outcome must be "through" or "out".'
    }

    const verdict: Verdict = outcome
    competition.overridePick(entryId, weekNumber, verdict)
    return `${entryId} is ${verdict} for Week ${weekNumber}.`
}

function overrideFixture(competition: SimCompetition, weekNumber: number, teamQuery: string, result: string): string {
    const query = teamQuery.toLowerCase()
    const matches = competition.fixturesOf(weekNumber).filter((fixture) => {
        return [fixture.homeTeamId, fixture.awayTeamId].some((teamId) => {
            return competition.teamName(teamId).toLowerCase().includes(query)
        })
    })
    if (query === '' || matches.length !== 1) {
        return `"${teamQuery}" matches ${matches.length} fixtures. Be more specific.`
    }

    const override = parseOverride(result)
    const fixture = matches[0]
    if (override === undefined || fixture === undefined) {
        return 'The result must be a score like 2-1, or "void".'
    }

    competition.overrideFixture(fixture.id, override)
    return `${fixtureLabel(competition, fixture)} is now ${result}.`
}

function parseOverride(text: string): FixtureOverride | undefined {
    if (text === 'void') {
        return { kind: 'void' }
    }

    const match = SCORE_PATTERN.exec(text)
    if (match === null) {
        return undefined
    }

    return { kind: 'result', home: Number(match[1]), away: Number(match[2]) }
}

function pickersOf(competition: SimCompetition, fixture: Fixture): string {
    const count = (teamId: string) => {
        return competition.state.picks.filter((pick) => {
            return pick.week === fixture.week && pick.teamId === teamId
        }).length
    }
    const home = count(fixture.homeTeamId)
    const away = count(fixture.awayTeamId)
    if (home + away === 0) {
        return ''
    }

    return ` (picked: ${home} home, ${away} away)`
}
