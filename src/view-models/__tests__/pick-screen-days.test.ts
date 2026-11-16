// Created by Claude driven by Eddie Long on 2026-11-16.

import { describe, expect, it } from 'vitest'

import { computeStandings } from '@/engine'
import type { GameState } from '@/engine'
import { beforeCutoff, buildState } from '@/engine/testing/builder'
import { dublinDayKey, formatDublinDay, formatDublinTime } from '@/lib/format'

import type { ViewContext } from '../context'
import { buildPickScreen } from '../pick-screen'

const base = buildState({
    weeks: [{
        fixtures: [
            ['Arsenal', 'Chelsea'],
            ['Everton', 'Fulham'],
            ['Brentford', 'Leeds'],
            ['Burnley', 'Wolves'],
        ],
    }],
    entries: ['ann'],
})

/** The same week, with the games kicking off at the times given, in the order of the fixtures above. */
function withKickoffs(state: GameState, kickoffs: readonly string[]): GameState {
    return {
        ...state,
        fixtures: state.fixtures.map((fixture, index) => {
            return { ...fixture, kickoffAt: new Date(kickoffs[index] ?? '') }
        }),
    }
}

function contextOf(state: GameState): ViewContext {
    const now = beforeCutoff(1)
    return {
        state,
        standings: computeStandings(state, now),
        now,
        nameOf: (entryId) => {
            return entryId
        },
        plMatchdayOf: () => {
            return 11
        },
        crestOf: () => {
            return null
        },
    }
}

describe('the pick screen’s days', () => {
    const state = withKickoffs(base, [
        '2026-11-28T17:30:00Z',
        '2026-11-28T12:30:00Z',
        '2026-11-29T14:00:00Z',
        '2026-11-28T15:00:00Z',
    ])
    const model = buildPickScreen(contextOf(state), 'ann', 1)

    it('shows each date once, with the games of that day under it', () => {
        expect(model.days.map((day) => {
            return [day.label, day.fixtures.length]
        })).toEqual([['Sat 28 Nov', 3], ['Sun 29 Nov', 1]])
    })

    it('puts the games of a day in kick-off order, each with its time', () => {
        expect(model.days[0]?.fixtures.map((fixture) => {
            return fixture.timeLabel
        })).toEqual(['12:30', '15:00', '17:30'])
    })

    it('keeps every game, and the flat list, in the same order as the days', () => {
        expect(model.days.flatMap((day) => {
            return day.fixtures.map((fixture) => {
                return fixture.id
            })
        })).toEqual(model.fixtures.map((fixture) => {
            return fixture.id
        }))
        expect(model.fixtures).toHaveLength(4)
    })

    it('groups by the Irish day, so a game just after midnight there is on the new day', () => {
        // 23:30 UTC is 00:30 the next day in Dublin during summer time.
        const summer = withKickoffs(base, [
            '2026-08-15T18:00:00Z',
            '2026-08-15T22:30:00Z',
            '2026-08-15T23:30:00Z',
            '2026-08-16T12:00:00Z',
        ])
        const days = buildPickScreen(contextOf(summer), 'ann', 1).days

        expect(days.map((day) => {
            return [day.label, day.fixtures.map((fixture) => {
                return fixture.timeLabel
            })]
        })).toEqual([
            ['Sat 15 Aug', ['19:00', '23:30']],
            ['Sun 16 Aug', ['00:30', '13:00']],
        ])
    })

    it('has no days for a week with no games', () => {
        const empty = { ...base, fixtures: [] }

        expect(buildPickScreen(contextOf(empty), 'ann', 1).days).toEqual([])
    })
})

describe('Irish day and time formats', () => {
    it('writes the day without a comma, and the time on a 24-hour clock', () => {
        const date = new Date('2026-11-28T15:00:00Z')

        expect(formatDublinDay(date)).toBe('Sat 28 Nov')
        expect(formatDublinTime(date)).toBe('15:00')
        expect(dublinDayKey(date)).toBe('2026-11-28')
    })

    it('uses summer time in the summer', () => {
        const date = new Date('2026-07-04T11:30:00Z')

        expect(formatDublinTime(date)).toBe('12:30')
    })
})
