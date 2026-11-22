// Created by Claude driven by Eddie Long on 2026-11-22.
//
// A team whose game has kicked off can no longer be picked, and a game that
// has already kicked off when a week opens must not drag the cut-off into the
// past. The “who plays” list also has to be the same wherever it is worked out,
// or a pick that was valid when it was made could be judged invalid later.

import { describe, expect, it } from 'vitest'

import {
    autoAssign,
    availableTeams,
    computeCutoff,
    computeStandings,
    validatePick,
} from '../index'
import type { GameState } from '../index'
import { beforeCutoff, buildState, cutoffOf, withPicks } from '../testing/builder'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** Moves one game to a new kick-off time. */
function withKickoff(state: GameState, home: string, kickoffAt: Date): GameState {
    return {
        ...state,
        fixtures: state.fixtures.map((fixture) => {
            return fixture.homeTeamId === home ? { ...fixture, kickoffAt } : fixture
        }),
    }
}

describe('computeCutoff', () => {
    const state = buildState({
        weeks: [{ fixtures: [['Arsenal', 'Chelsea'], ['Everton', 'Fulham'], ['Brentford', 'Leeds']] }],
        entries: ['ann'],
    })

    it('ignores a game that has already kicked off, as it must not pull the cut-off into the past', () => {
        const now = new Date(cutoffOf(1).getTime() - DAY_MS)
        const broughtForward = withKickoff(state, 'Arsenal', new Date(now.getTime() - 10 * DAY_MS))

        // Arsenal v Chelsea was played ten days ago. The cut-off follows the next game, not that one.
        const nextKickoff = Math.min(...broughtForward.fixtures.filter((fixture) => {
            return fixture.homeTeamId !== 'Arsenal'
        }).map((fixture) => {
            return fixture.kickoffAt.getTime()
        }))
        expect(computeCutoff(broughtForward.fixtures, now)).toEqual(new Date(nextKickoff - HOUR_MS))
    })

    it('still uses a game that has not kicked off yet, however soon', () => {
        const now = new Date(cutoffOf(1).getTime() - DAY_MS)
        const soon = withKickoff(state, 'Arsenal', new Date(now.getTime() + 2 * HOUR_MS))

        expect(computeCutoff(soon.fixtures, now)).toEqual(new Date(now.getTime() + HOUR_MS))
    })

    it('is nothing when every game has kicked off or been postponed', () => {
        const now = new Date(cutoffOf(1).getTime() + 5 * DAY_MS)

        expect(computeCutoff(state.fixtures, now)).toBeNull()
    })
})

describe('picking a team whose game has already kicked off', () => {
    // Week 1 is open. Everton v Fulham has been brought forward and kicks off while picks are still open.
    const state = withKickoff(
        buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea'], ['Everton', 'Fulham']] }],
            entries: ['ann', 'bob'],
        }),
        'Everton',
        new Date(cutoffOf(1).getTime() - 6 * HOUR_MS),
    )
    const kickoff = state.fixtures.find((fixture) => {
        return fixture.homeTeamId === 'Everton'
    })!.kickoffAt

    it('refuses either side of the game once it has started', () => {
        const after = new Date(kickoff.getTime() + 60_000)

        expect(validatePick(state, after, 'ann', 1, 'Everton')).toEqual({ ok: false, reason: 'gameStarted' })
        expect(validatePick(state, after, 'ann', 1, 'Fulham')).toEqual({ ok: false, reason: 'gameStarted' })
    })

    it('allows it up to the moment the game starts, and refuses it at kick-off', () => {
        expect(validatePick(state, new Date(kickoff.getTime() - 1), 'ann', 1, 'Everton')).toEqual({ ok: true })
        expect(validatePick(state, kickoff, 'ann', 1, 'Everton')).toEqual({ ok: false, reason: 'gameStarted' })
    })

    it('still allows the other games, so a late game does not block the whole week', () => {
        const after = new Date(kickoff.getTime() + 60_000)

        expect(validatePick(state, after, 'ann', 1, 'Arsenal')).toEqual({ ok: true })
    })

    it('does not offer a team whose game has started', () => {
        const standings = computeStandings(state, new Date(kickoff.getTime() + 60_000))
        const names = availableTeams(state, standings, 'ann', 1, new Date(kickoff.getTime() + 60_000)).map((team) => {
            return team.id
        })

        expect(names).toEqual(['Arsenal', 'Chelsea'])
    })

    it('never auto-assigns a team whose game started before the cut-off', () => {
        const assigned = autoAssign(state, cutoffOf(1), 1)

        expect(assigned.map((pick) => {
            return pick.teamId
        })).toEqual(['Arsenal', 'Arsenal'])
    })
})

describe('a pick that was valid when it was made is never judged invalid later', () => {
    // Two players, four teams, the used teams starting again in Week 4. A game in Week 4 is brought forward,
    // so it is left out of who plays at the cut-off. A pick is checked at many moments before the cut-off.
    // Whenever the engine accepts it, the standings must count it, not leave it “awaiting a pick” for ever.
    const base = buildState({
        weeks: [
            { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '1-0']] },
            { fixtures: [['Chelsea', 'Everton', '0-1'], ['Arsenal', 'Fulham', '2-0']] },
            { fixtures: [['Chelsea', 'Fulham', '1-0'], ['Arsenal', 'Everton', '1-0']] },
            { fixtures: [['Arsenal', 'Everton', '1-0'], ['Chelsea', 'Fulham', '1-0']] },
        ],
        entries: ['ann', 'bob'],
        picks: {
            ann: ['Arsenal', 'Everton', 'Chelsea'],
            bob: ['Everton', 'Arsenal', 'Chelsea'],
        },
    })
    const kickoffs = [
        ['early', 6 * HOUR_MS],
        ['mid', 1.5 * HOUR_MS],
    ] as const

    for (const [label, beforeCutoffMs] of kickoffs) {
        it(`holds with Chelsea v Fulham brought forward to ${label} (${beforeCutoffMs / HOUR_MS} hours before the cut-off)`, () => {
            const state = withKickoff(base, 'Chelsea', new Date(cutoffOf(4).getTime() - beforeCutoffMs))

            for (const team of ['Arsenal', 'Chelsea', 'Everton', 'Fulham']) {
                for (let hoursBefore = 90; hoursBefore >= 0.25; hoursBefore -= 7.25) {
                    const now = new Date(cutoffOf(4).getTime() - hoursBefore * HOUR_MS)
                    const verdict = validatePick(state, now, 'ann', 4, team)
                    if (!verdict.ok) {
                        continue
                    }

                    const picked = withPicks(state, [{ entryId: 'ann', week: 4, teamId: team, source: 'player' }])
                    const week = computeStandings(picked, new Date(cutoffOf(4).getTime() + 8 * HOUR_MS))
                        .entries.get('ann')?.weeks.find((entryWeek) => {
                            return entryWeek.week === 4
                        })

                    expect(week?.reason, `${team} accepted ${hoursBefore}h before the cut-off`).not.toBe('awaitingPick')
                }
            }
        })
    }

    it('holds in a longer season, when the used teams start again every other week', () => {
        const weeks = Array.from({ length: 8 }, (_, index) => {
            const isEven = index % 2 === 0
            return {
                fixtures: [
                    ['Arsenal', 'Chelsea', isEven ? '1-0' : '0-1'] as const,
                    ['Everton', 'Fulham', isEven ? '1-0' : '0-1'] as const,
                ],
            }
        })
        // Both players win every week, picking the winner of one game or the other.
        const picks: { ann: string[]; bob: string[] } = { ann: [], bob: [] }
        for (let week = 1; week <= 7; week += 1) {
            const isEven = (week - 1) % 2 === 0
            picks.ann.push(isEven ? 'Arsenal' : 'Chelsea')
            picks.bob.push(isEven ? 'Everton' : 'Fulham')
        }

        const state = buildState({ weeks, entries: ['ann', 'bob'], picks })
        for (const team of ['Arsenal', 'Chelsea', 'Everton', 'Fulham']) {
            const verdict = validatePick(state, beforeCutoff(8), 'ann', 8, team)
            if (!verdict.ok) {
                continue
            }

            const picked = withPicks(state, [{ entryId: 'ann', week: 8, teamId: team, source: 'player' }])
            const week = computeStandings(picked, new Date(cutoffOf(8).getTime() + 8 * HOUR_MS))
                .entries.get('ann')?.weeks.find((entryWeek) => {
                    return entryWeek.week === 8
                })

            expect(week?.reason, `${team} was accepted`).not.toBe('awaitingPick')
        }
    })
})
