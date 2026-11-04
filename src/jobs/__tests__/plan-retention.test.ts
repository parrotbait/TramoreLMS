// Created by Claude driven by Eddie Long on 2026-11-04.

import { describe, expect, it } from 'vitest'

import { isDueForRemoval, RETENTION_DAYS } from '../plan-retention'

const DAY_MS = 24 * 60 * 60 * 1000
const now = new Date(Date.UTC(2027, 8, 1))

function daysAgo(days: number): Date {
    return new Date(now.getTime() - days * DAY_MS)
}

const person = { optedIn: false, isAdmin: false }

describe('isDueForRemoval', () => {
    it('removes the email 90 days after the competition ends', () => {
        expect(RETENTION_DAYS).toBe(90)
        expect(isDueForRemoval({ ...person, competitionEnds: [daysAgo(90)] }, now)).toBe(true)
        expect(isDueForRemoval({ ...person, competitionEnds: [daysAgo(89)] }, now)).toBe(false)
    })

    it('keeps the email while any of their competitions is still going', () => {
        expect(isDueForRemoval({ ...person, competitionEnds: [daysAgo(400), null] }, now)).toBe(false)
    })

    it('waits for the last of their competitions', () => {
        expect(isDueForRemoval({ ...person, competitionEnds: [daysAgo(400), daysAgo(10)] }, now)).toBe(false)
    })

    it('keeps people who opted in to future competitions', () => {
        expect(isDueForRemoval({ ...person, optedIn: true, competitionEnds: [daysAgo(400)] }, now)).toBe(false)
    })

    it('keeps admins, and people with no entries', () => {
        expect(isDueForRemoval({ ...person, isAdmin: true, competitionEnds: [daysAgo(400)] }, now)).toBe(false)
        expect(isDueForRemoval({ ...person, competitionEnds: [] }, now)).toBe(false)
    })
})
