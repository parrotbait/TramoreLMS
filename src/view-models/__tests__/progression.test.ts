// Created by Claude driven by Eddie Long on 2026-10-31.

import { describe, expect, it } from 'vitest'

import { computeStandings } from '@/engine'
import type { GameState } from '@/engine'
import { afterWeek, beforeCutoff, buildState, withPicks } from '@/engine/testing/builder'

import type { ViewContext } from '../context'
import { buildProgression } from '../progression'
import type { ProgressionCell, ProgressionModel } from '../progression'

function contextOf(state: GameState, now: Date): ViewContext {
    return {
        state,
        standings: computeStandings(state, now),
        now,
        nameOf: (entryId) => {
            return entryId
        },
        plMatchdayOf: (weekNumber) => {
            return weekNumber + 10
        },
        crestOf: (teamId) => {
            return teamId === 'Arsenal' ? '/crests/arsenal.png' : null
        },
    }
}

function cellsOf(model: ProgressionModel, entryId: string): readonly ProgressionCell[] {
    const row = model.sections.flatMap((section) => {
        return section.rows
    }).find((candidate) => {
        return candidate.entryId === entryId
    })
    if (row === undefined) {
        throw new Error(`No row for ${entryId}`)
    }

    return row.cells
}

const twoWeeks = buildState({
    weeks: [
        { fixtures: [['Arsenal', 'Chelsea', '1-0'], ['Everton', 'Fulham', '1-0']] },
        { fixtures: [['Arsenal', 'Everton'], ['Chelsea', 'Fulham']] },
    ],
    entries: ['ann', 'bob', 'cat', 'dan'],
    picks: { ann: ['Arsenal'], bob: ['Everton'], cat: ['Chelsea'] },
})
const withAutoPick = withPicks(twoWeeks, [{ entryId: 'dan', week: 1, teamId: 'Arsenal', source: 'auto' }])

describe('buildProgression', () => {
    const model = buildProgression(contextOf(withAutoPick, beforeCutoff(2)))

    it('has one column per week, with the PL matchday', () => {
        expect(model.weeks.map((week) => {
            return [week.number, week.plMatchday]
        })).toEqual([[1, 11], [2, 12]])
    })

    it('counts survivors after each settled week, and none for an unsettled one', () => {
        expect(model.weeks.map((week) => {
            return week.survivorsAfter
        })).toEqual([3, null])
        expect(model.totalEntries).toBe(4)
    })

    it('groups players still in first, then the out lists', () => {
        expect(model.sections.map((section) => {
            return [section.key, section.title]
        })).toEqual([['in', 'Still in (3)'], ['out-1', 'Out in Week 1 (1)']])
        expect(model.sections[0]?.rows.map((row) => {
            return row.entryId
        })).toEqual(['ann', 'bob', 'dan'])
    })

    it('shows the pick, crest and result for a settled week', () => {
        expect(cellsOf(model, 'ann')[0]).toMatchObject({
            kind: 'pick',
            teamName: 'Arsenal',
            crestUrl: '/crests/arsenal.png',
            outcome: 'through',
            auto: false,
            matchLabel: 'Arsenal v Chelsea 1–0',
        })
        expect(cellsOf(model, 'cat')[0]).toMatchObject({ kind: 'pick', outcome: 'out', crestUrl: null })
    })

    it('marks auto-assigned picks', () => {
        expect(cellsOf(model, 'dan')[0]).toMatchObject({ kind: 'pick', auto: true })
    })

    it('hides every pick for a week before its cut-off', () => {
        expect(cellsOf(model, 'ann')[1]).toEqual({ kind: 'hidden' })
        expect(cellsOf(model, 'bob')[1]).toEqual({ kind: 'hidden' })
    })

    it('leaves the cell empty for weeks after a player went out', () => {
        expect(cellsOf(model, 'cat')[1]).toEqual({ kind: 'empty' })
    })

    it('counts a buy-back as still in after Week 1, and marks the Week 2 pick', () => {
        const withWeekTwoPick = withPicks(withAutoPick, [{ entryId: 'cat', week: 2, teamId: 'Fulham', source: 'player' }])
        const boughtBack: GameState = {
            ...withWeekTwoPick,
            entries: withWeekTwoPick.entries.map((entry) => {
                return entry.id === 'cat' ? { ...entry, boughtBack: true } : entry
            }),
        }
        const result = buildProgression(contextOf(boughtBack, afterWeek(2)))

        expect(result.weeks[0]?.survivorsAfter).toBe(4)
        expect(cellsOf(result, 'cat')[0]).toMatchObject({ outcome: 'out', boughtBack: false })
        expect(cellsOf(result, 'cat')[1]).toMatchObject({ kind: 'pick', teamName: 'Fulham', boughtBack: true })
        expect(result.sections).toHaveLength(1)
    })

    it('marks a week where everyone went out and all stayed in', () => {
        const allOut = buildState({
            weeks: [{ fixtures: [['Arsenal', 'Chelsea', '1-1']] }],
            entries: ['ann', 'bob'],
            picks: { ann: ['Arsenal'], bob: ['Chelsea'] },
        })
        const result = buildProgression(contextOf(allOut, afterWeek(1)))

        expect(cellsOf(result, 'ann')[0]).toMatchObject({ outcome: 'out', reinstated: true })
        expect(result.weeks[0]?.survivorsAfter).toBe(2)
    })

    it('marks which sections are still in', () => {
        expect(model.sections.map((section) => {
            return section.isStillIn
        })).toEqual([true, false])
    })
})
