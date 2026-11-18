// Created by Claude driven by Eddie Long on 2026-11-18.

import { describe, expect, it } from 'vitest'

import { backupHealth } from '../health'

const NOW = new Date('2026-11-18T12:00:00Z')
const hoursBefore = (hours: number) => {
    return new Date(NOW.getTime() - hours * 60 * 60 * 1000)
}

describe('backupHealth', () => {
    it('says so when no Blob store is connected', () => {
        expect(backupHealth(false, null, NOW)).toEqual({ state: 'notSetUp' })
    })

    it('says so when a store is connected but nothing has been saved yet', () => {
        expect(backupHealth(true, null, NOW)).toEqual({ state: 'none' })
    })

    it('is fine for a backup from the last few hours', () => {
        expect(backupHealth(true, hoursBefore(0.2), NOW)).toEqual({ state: 'ok', hoursAgo: 0 })
        expect(backupHealth(true, hoursBefore(6), NOW)).toEqual({ state: 'ok', hoursAgo: 6 })
    })

    it('allows one missed run, then calls it late', () => {
        expect(backupHealth(true, hoursBefore(12), NOW)).toEqual({ state: 'ok', hoursAgo: 12 })
        expect(backupHealth(true, hoursBefore(13), NOW)).toEqual({ state: 'late', hoursAgo: 13 })
        expect(backupHealth(true, hoursBefore(72), NOW)).toEqual({ state: 'late', hoursAgo: 72 })
    })

    it('never shows a negative age if the clocks differ a little', () => {
        expect(backupHealth(true, new Date(NOW.getTime() + 60_000), NOW)).toEqual({ state: 'ok', hoursAgo: 0 })
    })
})
