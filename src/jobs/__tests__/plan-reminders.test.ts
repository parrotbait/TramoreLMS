// Created by Claude driven by Eddie Long on 2026-11-04.

import { describe, expect, it } from 'vitest'

import { computeStandings } from '@/engine'
import type { GameState } from '@/engine'
import { buildState, cutoffOf } from '@/engine/testing/builder'

import { planReminders, REMINDER_LEAD_MS, reminderKey } from '../plan-reminders'

const HOUR_MS = 60 * 60 * 1000

/** Hours before a week's cut-off. */
function hoursBefore(weekNumber: number, hours: number): Date {
    return new Date(cutoffOf(weekNumber).getTime() - hours * HOUR_MS)
}

const LONG_AGO = new Date(Date.UTC(2026, 9, 1))

function plan(state: GameState, now: Date, options: {
    readonly alreadySent?: readonly string[]
    readonly joinedAt?: Readonly<Record<string, Date>>
} = {}) {
    const joinedAt = new Map(state.entries.map((entry) => {
        return [entry.id, options.joinedAt?.[entry.id] ?? LONG_AGO] as const
    }))

    return planReminders({
        state,
        standings: computeStandings(state, now),
        now,
        joinedAt,
        alreadySent: new Set(options.alreadySent ?? []),
    }).map((due) => {
        return `${due.entryId}:${due.weekNumber}`
    })
}

// Week 1: Arsenal won, Chelsea lost, Everton v Fulham not played yet.
// ann is through. bob is out. cat waits on Everton. dan has already picked
// for Week 2. eve withdrew from Week 2.
function weekTwo(evertonResult = '-') {
    return buildState({
        weeks: [
            { fixtures: [['Arsenal', 'Chelsea', '2-0'], ['Everton', 'Fulham', evertonResult]] },
            { fixtures: [['Arsenal', 'Everton'], ['Chelsea', 'Fulham']] },
        ],
        entries: ['ann', 'bob', 'cat', 'dan', 'eve'],
        picks: {
            ann: ['Arsenal'],
            bob: ['Chelsea'],
            cat: ['Everton'],
            dan: ['Arsenal', 'Fulham'],
            eve: ['Arsenal'],
        },
        withdrawn: { eve: 2 },
    })
}

describe('planReminders', () => {
    it('waits until the cut-off is 24 hours away', () => {
        expect(REMINDER_LEAD_MS).toBe(24 * HOUR_MS)
        expect(plan(weekTwo(), hoursBefore(2, 25))).toEqual([])
    })

    it('reminds only players who can pick and haven’t', () => {
        expect(plan(weekTwo(), hoursBefore(2, 23))).toEqual(['ann:2'])
    })

    it('sends each reminder once', () => {
        expect(plan(weekTwo(), hoursBefore(2, 23), { alreadySent: [reminderKey('ann', 2)] })).toEqual([])
    })

    it('reminds a player whose result comes in after the 24-hour point', () => {
        const now = hoursBefore(2, 5)
        expect(plan(weekTwo('1-0'), now, { alreadySent: [reminderKey('ann', 2)] })).toEqual(['cat:2'])
    })

    it('never reminds a player who went out late', () => {
        expect(plan(weekTwo('0-1'), hoursBefore(2, 5), { alreadySent: [reminderKey('ann', 2)] })).toEqual([])
    })

    it('stops at the cut-off', () => {
        expect(plan(weekTwo('1-0'), cutoffOf(2))).toEqual([])
    })

    it('leaves out players who entered inside the 24 hours, as they just had the welcome email', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea']] }],
            entries: ['early', 'late'],
        })

        expect(plan(state, hoursBefore(1, 2), { joinedAt: { late: hoursBefore(1, 3) } })).toEqual(['early:1'])
    })

    it('ignores weeks that have not opened', () => {
        const state = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea']], open: false }],
            entries: ['ann'],
        })

        expect(plan(state, hoursBefore(1, 2))).toEqual([])
    })
})
