// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Scenario files: a season written as YAML, with the outcome you expect.
// They double as regression tests (sim/scenarios.test.ts runs every file).
//
// Fixture lines:
//   "Arsenal v Chelsea 1-0"          finished, both feeds agree
//   "Arsenal v Chelsea 2-1|2-2"      feeds disagree, so the result is held
//   "Arsenal v Chelsea 2-1|-"        cross-check never reports, so it is held
//   "Arsenal v Chelsea P"            postponed before the cut-off
//   "Arsenal v Chelsea PL"           postponed after the cut-off
//   "Arsenal v Chelsea A"            abandoned
//   "Arsenal v Chelsea"              not played
//   "Arsenal v Chelsea 0-1 => 2-1"   admin fixture override (or "=> void")

import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

import { isBuybackAvailable } from '@/engine'
import type { EntryStatus, FeedScore, FixtureOverride, Standings, Team } from '@/engine'
import { weekStart } from '@/engine/testing/builder'

import { SimCompetition } from './competition'
import type { FixtureSeed } from './competition'
import { describeOutcome, describeWeek } from './report'
import { playWeek } from './week'
import type { PickRequest, PlannedResult, WeekDriver, WeekLog } from './week'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const RESULT_PATTERN = /^(\d+-\d+(\|(\d+-\d+|-))?|P|PL|A|-)$/
const SCORE_PATTERN = /^(\d+)-(\d+)$/

const nameList = z.array(z.string()).optional()
const verdict = z.enum(['through', 'out'])

const expectSchema = z.object({
    in: nameList,
    out: nameList,
    provisionallyOut: nameList,
    winner: nameList,
    withdrawn: nameList,
    stillIn: z.number().int().optional(),
    /** Entry to auto-assigned team. `null` means an auto-pass. */
    auto: z.record(z.string(), z.string().nullable()).optional(),
    rejected: z.record(z.string(), z.string()).optional(),
    buybackRejected: nameList,
    buybackAvailable: nameList,
    held: nameList,
    cutoff: z.string().optional(),
    outcome: z.enum(['running', 'won', 'noPlayers']).optional(),
    winners: nameList,
}).strict()

const weekSchema = z.object({
    fixtures: z.array(z.string()).min(1),
    picks: z.record(z.string(), z.string()).optional(),
    repicks: z.record(z.string(), z.string()).optional(),
    pickOverrides: z.record(z.string(), verdict).optional(),
    buyBack: nameList,
    withdraw: nameList,
    expect: expectSchema.optional(),
}).strict()

const correctionSchema = z.union([
    z.object({ week: z.number().int(), fixture: z.string(), result: z.string() }).strict(),
    z.object({ week: z.number().int(), pick: z.string(), outcome: verdict }).strict(),
])

const scenarioSchema = z.object({
    name: z.string(),
    rule: z.string(),
    description: z.string().optional(),
    entries: z.array(z.string()).min(1),
    finalWeek: z.number().int().positive().optional(),
    prize: z.number().positive().optional(),
    weeks: z.array(weekSchema).min(1),
    corrections: z.array(correctionSchema).optional(),
    expectAfterCorrections: expectSchema.optional(),
}).strict()

export type Scenario = z.infer<typeof scenarioSchema>
type Expectation = z.infer<typeof expectSchema>
type ScenarioWeek = z.infer<typeof weekSchema>

interface ParsedFixture {
    readonly home: string
    readonly away: string
    readonly result: string | undefined
    readonly override: FixtureOverride | undefined
}

export interface ScenarioRun {
    readonly name: string
    readonly failures: readonly string[]
    readonly report: string
}

export function parseScenario(text: string, source: string): Scenario {
    const parsed = scenarioSchema.safeParse(parseYaml(text))
    if (!parsed.success) {
        throw new Error(`${source} is not a valid scenario:\n${z.prettifyError(parsed.error)}`)
    }

    return parsed.data
}

export async function runScenario(scenario: Scenario): Promise<ScenarioRun> {
    const weeks = scenario.weeks.map((week) => {
        return week.fixtures.map(parseFixtureLine)
    })
    const competition = new SimCompetition(teamsOf(weeks), scenario.entries, scenario.finalWeek ?? 30)
    const failures: string[] = []
    const report: string[] = [`${scenario.name} (${scenario.rule})`]
    let previousAfterAt: Date | null = null

    for (const [index, week] of scenario.weeks.entries()) {
        const weekNumber = index + 1
        const parsed = weeks[index] ?? []
        const log = await playWeek(competition, scenarioDriver(weekNumber, week, parsed), previousAfterAt)
        const standings = competition.standings(log.afterAt)

        report.push(describeWeek(competition, log, standings, { verbose: true, plMatchday: weekNumber }))
        if (week.expect !== undefined) {
            failures.push(...check(`Week ${weekNumber}`, week.expect, competition, standings, log, parsed))
        }

        previousAfterAt = log.afterAt
    }

    const finalAt = new Date((previousAfterAt ?? new Date()).getTime() + DAY_MS)
    if (scenario.corrections !== undefined) {
        applyCorrections(competition, scenario, weeks, finalAt)
    }

    const finalStandings = competition.standings(finalAt)
    if (scenario.expectAfterCorrections !== undefined) {
        failures.push(...check('After corrections', scenario.expectAfterCorrections, competition, finalStandings))
    }

    report.push(describeOutcome(finalStandings, (scenario.prize ?? 300) * 100))

    return { name: scenario.name, failures, report: report.join('\n') }
}

function scenarioDriver(weekNumber: number, week: ScenarioWeek, parsed: readonly ParsedFixture[]): WeekDriver {
    const seeds: FixtureSeed[] = parsed.map((fixture, index) => {
        return {
            homeTeamId: fixture.home,
            awayTeamId: fixture.away,
            kickoffAt: new Date(weekStart(weekNumber).getTime() + index * 2 * HOUR_MS),
        }
    })
    const idOf = (fixture: ParsedFixture) => {
        return `w${weekNumber}-${fixture.home}-${fixture.away}`
    }

    return {
        weekNumber,
        fixtures: seeds,
        withdrawals: week.withdraw ?? [],
        buybacks: week.buyBack ?? [],
        pickOverrides: Object.entries(week.pickOverrides ?? {}),
        picks: () => {
            return toRequests(week.picks)
        },
        earlyPostponements: () => {
            return parsed
                .filter((fixture) => {
                    return fixture.result === 'P'
                })
                .map(idOf)
        },
        repicks: () => {
            return toRequests(week.repicks)
        },
        results: () => {
            return new Map(parsed.map((fixture) => {
                return [idOf(fixture), plannedResult(fixture.result)] as const
            }))
        },
        fixtureOverrides: () => {
            return new Map(parsed.flatMap((fixture) => {
                return fixture.override === undefined ? [] : [[idOf(fixture), fixture.override] as const]
            }))
        },
    }
}

function applyCorrections(
    competition: SimCompetition,
    scenario: Scenario,
    weeks: readonly (readonly ParsedFixture[])[],
    at: Date,
) {
    for (const correction of scenario.corrections ?? []) {
        if ('pick' in correction) {
            competition.overridePick(correction.pick, correction.week, correction.outcome)
            continue
        }

        const [home, away] = correction.fixture.split(' v ')
        const exists = weeks[correction.week - 1]?.some((fixture) => {
            return fixture.home === home && fixture.away === away
        })
        if (!exists) {
            throw new Error(`Correction names an unknown fixture: Week ${correction.week} ${correction.fixture}`)
        }

        competition.overrideFixture(`w${correction.week}-${home}-${away}`, parseOverride(correction.result))
    }

    // A correction can make players eligible again, so auto-assign runs again like the real tick.
    for (const week of competition.state.weeks) {
        competition.lock(week.number, at)
    }
}

function check(
    label: string,
    expectation: Expectation,
    competition: SimCompetition,
    standings: Standings,
    log?: WeekLog,
    parsed?: readonly ParsedFixture[],
): string[] {
    const failures: string[] = []
    const fail = (message: string) => {
        failures.push(`${label}: ${message}`)
    }

    const statusChecks: readonly (readonly [EntryStatus, readonly string[] | undefined])[] = [
        ['in', expectation.in],
        ['out', expectation.out],
        ['provisionallyOut', expectation.provisionallyOut],
        ['winner', expectation.winner],
        ['withdrawn', expectation.withdrawn],
    ]
    for (const [status, entryIds] of statusChecks) {
        for (const entryId of entryIds ?? []) {
            const actual = standings.entries.get(entryId)?.status
            if (actual !== status) {
                fail(`expected ${entryId} to be ${status}, but they are ${actual ?? 'unknown'}`)
            }
        }
    }

    if (expectation.stillIn !== undefined) {
        const stillIn = [...standings.entries.values()].filter((standing) => {
            return standing.status === 'in'
        }).length
        if (stillIn !== expectation.stillIn) {
            fail(`expected ${expectation.stillIn} still in, but there are ${stillIn}`)
        }
    }

    if (expectation.outcome !== undefined && standings.outcome.kind !== expectation.outcome) {
        fail(`expected outcome ${expectation.outcome}, but it is ${standings.outcome.kind}`)
    }

    if (expectation.winners !== undefined) {
        const winners = standings.outcome.kind === 'won' ? [...standings.outcome.winners].sort() : []
        const expected = [...expectation.winners].sort()
        if (winners.join(',') !== expected.join(',')) {
            fail(`expected winners [${expected.join(', ')}], but got [${winners.join(', ')}]`)
        }
    }

    if (log !== undefined) {
        failures.push(...checkWeekLog(label, expectation, competition, standings, log, parsed ?? []))
    }

    return failures
}

function checkWeekLog(
    label: string,
    expectation: Expectation,
    competition: SimCompetition,
    standings: Standings,
    log: WeekLog,
    parsed: readonly ParsedFixture[],
): string[] {
    const failures: string[] = []
    const fail = (message: string) => {
        failures.push(`${label}: ${message}`)
    }

    for (const [entryId, team] of Object.entries(expectation.auto ?? {})) {
        const autoPick = log.autoPicks.find((pick) => {
            return pick.entryId === entryId
        })
        if (autoPick === undefined) {
            fail(`expected ${entryId} to be auto-assigned ${team ?? 'a pass'}, but they were not auto-assigned`)
            continue
        }

        if (autoPick.teamId !== team) {
            fail(`expected ${entryId} to be auto-assigned ${team ?? 'a pass'}, but got ${autoPick.teamId ?? 'a pass'}`)
        }
    }

    for (const [entryId, reason] of Object.entries(expectation.rejected ?? {})) {
        const rejection = log.rejections.find((candidate) => {
            return candidate.entryId === entryId
        })
        if (rejection?.reason !== reason) {
            fail(`expected ${entryId}'s pick to be rejected as ${reason}, but got ${rejection?.reason ?? 'no rejection'}`)
        }
    }

    for (const entryId of expectation.buybackRejected ?? []) {
        if (!log.buybackRejections.includes(entryId)) {
            fail(`expected ${entryId}'s buy-back to be rejected`)
        }
    }

    for (const entryId of expectation.buybackAvailable ?? []) {
        if (!isBuybackAvailable(competition.state, standings, log.afterAt, entryId)) {
            fail(`expected buy-back to be available to ${entryId}`)
        }
    }

    if (expectation.held !== undefined) {
        const heldIds = new Set(competition.heldFixtures.map((held) => {
            return held.fixtureId
        }))
        const held = parsed
            .filter((fixture) => {
                return heldIds.has(`w${log.weekNumber}-${fixture.home}-${fixture.away}`)
            })
            .map((fixture) => {
                return `${fixture.home} v ${fixture.away}`
            })
        if (held.join(',') !== expectation.held.join(',')) {
            fail(`expected held [${expectation.held.join(', ')}], but got [${held.join(', ')}]`)
        }
    }

    if (expectation.cutoff !== undefined && log.cutoffAt.toISOString() !== new Date(expectation.cutoff).toISOString()) {
        fail(`expected cut-off ${expectation.cutoff}, but it is ${log.cutoffAt.toISOString()}`)
    }

    return failures
}

function parseFixtureLine(line: string): ParsedFixture {
    const [match, overrideText] = line.split(' => ')
    const [home, rest] = (match ?? '').split(' v ')
    if (home === undefined || rest === undefined) {
        throw new Error(`Not a fixture: "${line}". Write it as "Home v Away 1-0".`)
    }

    const tokens = rest.trim().split(/\s+/)
    const last = tokens.at(-1) ?? ''
    const hasResult = tokens.length > 1 && RESULT_PATTERN.test(last)

    return {
        home: home.trim(),
        away: (hasResult ? tokens.slice(0, -1) : tokens).join(' '),
        result: hasResult ? last : undefined,
        override: overrideText === undefined ? undefined : parseOverride(overrideText.trim()),
    }
}

function plannedResult(result: string | undefined): PlannedResult {
    switch (result) {
        case undefined:
        case '-':
        case 'P':
            return { kind: 'unplayed' }
        case 'PL':
            return { kind: 'postponedLate' }
        case 'A':
            return { kind: 'abandoned' }
        default:
            break
    }

    const [primary, secondary] = result.split('|')
    const primaryScore = parseScore(primary ?? '')
    const secondaryScore = secondary === undefined ? primaryScore : secondary === '-' ? null : parseScore(secondary)

    return { kind: 'score', primary: primaryScore, secondary: secondaryScore }
}

function parseOverride(text: string): FixtureOverride {
    if (text === 'void') {
        return { kind: 'void' }
    }

    const score = parseScore(text)
    return { kind: 'result', home: score.home, away: score.away }
}

function parseScore(text: string): FeedScore {
    const match = SCORE_PATTERN.exec(text)
    if (match === null) {
        throw new Error(`Not a score: "${text}"`)
    }

    return { home: Number(match[1]), away: Number(match[2]) }
}

function teamsOf(weeks: readonly (readonly ParsedFixture[])[]): Team[] {
    const names = new Set(weeks.flatMap((fixtures) => {
        return fixtures.flatMap((fixture) => {
            return [fixture.home, fixture.away]
        })
    }))

    return [...names].map((name) => {
        return { id: name, fullName: name }
    })
}

function toRequests(picks: Readonly<Record<string, string>> | undefined): PickRequest[] {
    return Object.entries(picks ?? {}).map(([entryId, teamId]) => {
        return { entryId, teamId }
    })
}
