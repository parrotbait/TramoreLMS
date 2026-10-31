// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Soak test: plays many random seasons and checks the rules held throughout.
// A failure prints the seed, so `pnpm sim --synthetic --seed <n>` replays it.

import { describe, expect, it } from 'vitest'

import { availableTeams } from '@/engine'

import { syntheticSeason } from './season'
import { simulateSeason } from './simulate'

const SEEDS = Array.from({ length: 30 }, (_, index) => {
    return index + 1
})

describe('Random seasons (soak test)', () => {
    it.each(SEEDS)('seed %i plays to a valid finish', async (seed) => {
        const players = 10 + (seed * 37) % 140
        const startMatchday = 1 + (seed * 11) % 30
        const finalWeek = 38 - startMatchday + 1
        const { standings, competition } = await simulateSeason({
            season: syntheticSeason(startMatchday),
            players,
            startMatchday,
            seed,
        })
        const context = `seed ${seed}, ${players} players, start ${startMatchday}`

        // The competition always finishes with at least one winner.
        expect(standings.outcome.kind, context).toBe('won')
        if (standings.outcome.kind !== 'won') {
            return
        }
        const { winners, week } = standings.outcome
        expect(winners.length, context).toBeGreaterThan(0)

        // An early finish means exactly one survivor. Shared prizes only happen in the final week.
        if (week < finalWeek) {
            expect(winners, context).toHaveLength(1)
        }

        for (const standing of standings.entries.values()) {
            const label = `${context}, ${standing.entryId}`

            // Nobody is left "in" once the competition is over.
            expect(['winner', 'out'], label).toContain(standing.status)
            expect(standing.status === 'winner', label).toBe(winners.includes(standing.entryId))

            // Rule 2: no team used twice by the same entry.
            const teams = standing.weeks.flatMap((entryWeek) => {
                const teamId = entryWeek.pick?.teamId
                return teamId === undefined || teamId === null ? [] : [teamId]
            })
            expect(new Set(teams).size, label).toBe(teams.length)

            // Every week up to the end has a final outcome.
            for (const entryWeek of standing.weeks) {
                expect(entryWeek.outcome, `${label}, week ${entryWeek.week}`).not.toBe('pending')
            }

            // Players who are out went out in a week they played.
            if (standing.status === 'out') {
                const lastWeek = standing.weeks.at(-1)
                expect(standing.eliminatedInWeek, label).toBe(lastWeek?.week)
                expect(lastWeek?.outcome, label).toBe('out')
            }
        }

        // Rule 6: a reinstated week means everyone still in that week went out.
        for (let weekNumber = 1; weekNumber <= week; weekNumber += 1) {
            const played = [...standings.entries.values()].flatMap((standing) => {
                return standing.weeks.filter((entryWeek) => {
                    return entryWeek.week === weekNumber
                })
            })
            const reinstated = played.filter((entryWeek) => {
                return entryWeek.reinstated
            })
            if (reinstated.length > 0) {
                expect(reinstated.length, `${context}, week ${weekNumber}`).toBe(played.length)
                expect(played.every((entryWeek) => {
                    return entryWeek.outcome === 'out'
                }), `${context}, week ${weekNumber}`).toBe(true)
            }
        }

        // Rule 4: every auto-pick was the first available team, alphabetically, at the cut-off.
        for (const pick of competition.state.picks) {
            const cutoffAt = competition.state.weeks.find((candidate) => {
                return candidate.number === pick.week
            })?.cutoffAt
            if (pick.source !== 'auto' || cutoffAt === undefined || cutoffAt === null) {
                continue
            }

            const first = availableTeams(competition.state, standings, pick.entryId, pick.week, cutoffAt)[0]
            expect(pick.teamId, `${context}, ${pick.entryId}, week ${pick.week}`).toBe(first?.id)
        }
    })
})
