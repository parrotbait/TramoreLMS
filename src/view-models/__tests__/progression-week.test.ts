// Created by Claude driven by Eddie Long on 2026-11-22.

import { describe, expect, it } from 'vitest'

import { currentProgressionWeek } from '../progression-week'

const weeks = (survivors: readonly (number | null)[]) => {
    return survivors.map((survivorsAfter, index) => {
        return { number: index + 1, survivorsAfter }
    })
}

describe('currentProgressionWeek', () => {
    it('is the first week that has not settled, not the last week of the season', () => {
        // 28 weeks in the season. Weeks 1 and 2 are settled. Week 3 is being played.
        expect(currentProgressionWeek(weeks([80, 61, ...Array<null>(26).fill(null)]))).toBe(3)
    })

    it('is Week 1 before anything has settled', () => {
        expect(currentProgressionWeek(weeks([null, null, null]))).toBe(1)
    })

    it('is the last week once every week has settled', () => {
        expect(currentProgressionWeek(weeks([40, 22, 9]))).toBe(3)
    })

    it('stays on the first unsettled week even if a later week looks settled', () => {
        expect(currentProgressionWeek(weeks([40, null, 9]))).toBe(2)
    })

    it('is nothing when there are no weeks', () => {
        expect(currentProgressionWeek([])).toBeNull()
    })
})
