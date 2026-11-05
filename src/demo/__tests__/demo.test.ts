// Created by Claude driven by Eddie Long on 2026-11-04.

import { describe, expect, it } from 'vitest'

import { computeStandings } from '@/engine'
import type { Fixture, GameState, Pick } from '@/engine'
import { buildState, cutoffOf } from '@/engine/testing/builder'
import { planTick } from '@/jobs/plan-tick'
import type { CompetitionStatus, TickWeek } from '@/jobs/plan-tick'
import { slug } from '@/lib/slug'

import { Random } from '../../../sim/random'
import cachedSeasonJson from '../../../sim/fixtures/pl-2026.json'
import { matchesFromCache } from '../../../sim/season-cache'
import { competitionNow } from '../clock'
import {
    afterGamesClock,
    botPicks,
    DEMO_BOTS,
    DEMO_WEEKS,
    demoFixtures,
    demoResults,
    demoStage,
    demoStartMatchday,
    nextStepLabel,
    pickingClock,
} from '../plan'

const HOUR_MS = 60 * 60 * 1000
const matches = matchesFromCache(cachedSeasonJson)

describe('competitionNow', () => {
    const real = new Date('2026-11-04T12:00:00Z')
    const demoTime = new Date('2026-11-21T08:30:00Z')

    it('uses the demo clock only for a demo', () => {
        expect(competitionNow({ isDemo: true, demoNow: demoTime }, real)).toBe(demoTime)
        expect(competitionNow({ isDemo: false, demoNow: null }, real)).toBe(real)
        expect(competitionNow({ isDemo: true, demoNow: null }, real)).toBe(real)
    })
})

describe('demoStage', () => {
    const state = buildState({
        weeks: [{ fixtures: [['Arsenal', 'Chelsea']] }, { fixtures: [['Arsenal', 'Everton']] }],
        entries: ['you'],
    })
    const weeks = state.weeks.map((week) => {
        return { ...week, settledAt: null }
    })
    const standingsAt = (now: Date) => {
        return computeStandings(state, now)
    }

    it('is picking before the cut-off, and in the final hours within 3 hours of it', () => {
        const early = new Date(cutoffOf(1).getTime() - 5 * HOUR_MS)
        const late = new Date(cutoffOf(1).getTime() - 2 * HOUR_MS)

        expect(demoStage(weeks, standingsAt(early), early)).toMatchObject({ kind: 'picking', weekNumber: 1, isFinalHours: false })
        expect(demoStage(weeks, standingsAt(late), late)).toMatchObject({ kind: 'picking', weekNumber: 1, isFinalHours: true })
    })

    it('is locked from the cut-off until the week settles', () => {
        expect(demoStage(weeks, standingsAt(cutoffOf(1)), cutoffOf(1))).toEqual({ kind: 'locked', weekNumber: 1 })
    })

    it('moves to the next week once a week settles', () => {
        const settled = [
            { number: 1, cutoffAt: cutoffOf(1), settledAt: cutoffOf(1) },
            { number: 2, cutoffAt: cutoffOf(2), settledAt: null },
        ]
        expect(demoStage(settled, standingsAt(cutoffOf(1)), cutoffOf(1))).toMatchObject({ kind: 'picking', weekNumber: 2 })
    })

    it('labels each step in plain words', () => {
        expect(nextStepLabel({ kind: 'picking', weekNumber: 1, cutoffAt: cutoffOf(1), isFinalHours: false }))
            .toBe('Go to 3 hours before the cut-off')
        expect(nextStepLabel({ kind: 'picking', weekNumber: 1, cutoffAt: cutoffOf(1), isFinalHours: true }))
            .toBe('Close picks (pass the cut-off)')
        expect(nextStepLabel({ kind: 'locked', weekNumber: 3 })).toBe('Play the Week 3 games')
        expect(nextStepLabel({ kind: 'over' })).toBeNull()
    })
})

describe('demo fixtures', () => {
    it('starts at the first matchday at least 2 days away', () => {
        const start = demoStartMatchday(matches, new Date('2026-11-04T12:00:00Z'))
        const firstKickoff = Math.min(...matches
            .filter((match) => {
                return match.matchday === start
            })
            .map((match) => {
                return Date.parse(match.utcDate)
            }))

        expect(firstKickoff - Date.parse('2026-11-04T12:00:00Z')).toBeGreaterThanOrEqual(2 * 24 * HOUR_MS)
    })

    it('starts at 1 once the cached season is over', () => {
        expect(demoStartMatchday(matches, new Date('2027-08-01T12:00:00Z'))).toBe(1)
    })

    it('has 10 weeks of real fixtures', () => {
        const fixtures = demoFixtures(matches, 12)
        expect(new Set(fixtures.map((fixture) => {
            return fixture.weekNumber
        }))).toEqual(new Set(Array.from({ length: DEMO_WEEKS }, (_, index) => {
            return index + 1
        })))
        expect(fixtures[0]?.plMatchday).toBe(12)
    })
})

describe('a whole demo, step by step', () => {
    it('always reaches an end, using the real tick and rules', () => {
        for (const seed of [1, 2, 3, 4, 5]) {
            const result = playDemo(seed)
            expect(result.outcome).not.toBe('running')
            expect(result.steps).toBeLessThanOrEqual(DEMO_WEEKS * 3 + 1)
            expect(result.botPicks).toBeGreaterThan(0)
        }
    })

    it('leaves fixtures with an admin override alone', () => {
        const fixture: Fixture = {
            id: 'f1',
            week: 1,
            homeTeamId: 'arsenal',
            awayTeamId: 'chelsea',
            kickoffAt: cutoffOf(1),
            state: { kind: 'scheduled' },
            override: { kind: 'result', home: 0, away: 3 },
        }
        expect(demoResults([fixture], slug, new Random(1)).size).toBe(0)
    })
})

/** Plays a demo the way the Next step button does, without a database. */
function playDemo(seed: number): { readonly outcome: string; readonly steps: number; readonly botPicks: number } {
    const random = new Random(seed)
    const planned = demoFixtures(matches, 12)
    const teamNames = [...new Set(planned.flatMap((fixture) => {
        return [fixture.home, fixture.away]
    }))]
    let state: GameState = {
        teams: teamNames.map((name) => {
            return { id: slug(name), fullName: name }
        }),
        weeks: Array.from({ length: DEMO_WEEKS }, (_, index) => {
            return { number: index + 1, cutoffAt: null }
        }),
        finalWeek: DEMO_WEEKS,
        fixtures: planned.map((fixture, index) => {
            return {
                id: `f${index}`,
                week: fixture.weekNumber,
                homeTeamId: slug(fixture.home),
                awayTeamId: slug(fixture.away),
                kickoffAt: fixture.kickoffAt,
                state: { kind: 'scheduled' },
            }
        }),
        entries: ['you', ...Array.from({ length: DEMO_BOTS }, (_, index) => {
            return `bot${index}`
        })].map((id) => {
            return { id, boughtBack: false }
        }),
        picks: [],
        pickOverrides: [],
    }
    const bots = new Set(state.entries
        .map((entry) => {
            return entry.id
        })
        .filter((id) => {
            return id !== 'you'
        }))
    let weeks: TickWeek[] = state.weeks.map((week) => {
        return { number: week.number, openedAt: null, settledAt: null }
    })
    let status: CompetitionStatus = 'open'
    let now = new Date(Math.min(...planned.map((fixture) => {
        return fixture.kickoffAt.getTime()
    })) - 3 * 24 * HOUR_MS)
    let botPickCount = 0

    const tick = () => {
        const plan = planTick({ state, weeks, status, now })
        state = {
            ...state,
            weeks: state.weeks.map((week) => {
                const opening = plan.openings.find((candidate) => {
                    return candidate.weekNumber === week.number
                })
                return opening === undefined ? week : { ...week, cutoffAt: opening.cutoffAt }
            }),
            picks: merge(state.picks, plan.picks),
        }
        weeks = weeks.map((week) => {
            const isOpened = plan.openings.some((opening) => {
                return opening.weekNumber === week.number
            })
            return {
                ...week,
                openedAt: isOpened ? now : week.openedAt,
                settledAt: plan.settledWeeks.includes(week.number) ? now : week.settledAt,
            }
        })
        status = plan.status
    }
    const pickForBots = () => {
        const open = state.weeks.find((week) => {
            return week.cutoffAt !== null && week.cutoffAt.getTime() > now.getTime()
        })
        if (open === undefined) {
            return
        }

        const chosen = botPicks(state, computeStandings(state, now), bots, open.number, now, (id) => {
            return id
        }, random)
        botPickCount += chosen.length
        state = { ...state, picks: merge(state.picks, chosen) }
    }

    tick()
    pickForBots()

    let steps = 0
    for (; steps < DEMO_WEEKS * 4; steps += 1) {
        const weekRows = state.weeks.map((week) => {
            return {
                ...week,
                settledAt: weeks.find((row) => {
                    return row.number === week.number
                })?.settledAt ?? null,
            }
        })
        const stage = demoStage(weekRows, computeStandings(state, now), now)
        if (stage.kind === 'over') {
            break
        }

        if (stage.kind === 'picking') {
            now = pickingClock(stage)
            tick()
            continue
        }

        const weekFixtures = state.fixtures.filter((fixture) => {
            return fixture.week === stage.weekNumber
        })
        const results = demoResults(weekFixtures, (id) => {
            return id
        }, random)
        state = {
            ...state,
            fixtures: state.fixtures.map((fixture) => {
                const score = results.get(fixture.id)
                return score === undefined ? fixture : { ...fixture, state: { kind: 'finished', ...score } }
            }),
        }
        now = afterGamesClock(weekFixtures, now)
        tick()
        pickForBots()
    }

    return { outcome: computeStandings(state, now).outcome.kind, steps, botPicks: botPickCount }
}

function merge(existing: readonly Pick[], added: readonly Pick[]): readonly Pick[] {
    return [
        ...existing.filter((pick) => {
            return !added.some((candidate) => {
                return candidate.entryId === pick.entryId && candidate.week === pick.week
            })
        }),
        ...added,
    ]
}
