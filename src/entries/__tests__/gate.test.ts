// Created by Claude driven by Eddie Long on 2026-11-01.

import { describe, expect, it } from 'vitest'

import { entryGate } from '../gate'
import type { MyEntry } from '../gate'

const now = new Date('2026-11-01T19:00:00Z')
const later = new Date('2026-11-01T19:45:00Z')
const earlier = new Date('2026-11-01T18:00:00Z')

function entry(id: string, overrides: Partial<MyEntry> = {}): MyEntry {
    return {
        entryId: id,
        competitionId: 'c1',
        competitionName: 'Last Man Standing 2026/27',
        displayName: id,
        status: 'active',
        holdExpiresAt: null,
        entryFeeCents: 1000,
        ...overrides,
    }
}

describe('entryGate', () => {
    it('lets a paid entry through to picking', () => {
        expect(entryGate([entry('ann')], now)).toMatchObject({ kind: 'ready', unpaid: [] })
    })

    it('still lets a paid entry through when another entry is unpaid, and lists the unpaid one', () => {
        const gate = entryGate([entry('ann'), entry('kid', { status: 'pending', holdExpiresAt: later })], now)
        expect(gate.kind).toBe('ready')
        expect(gate.kind === 'ready'
            ? gate.unpaid.map((item) => {
                return item.entryId
            })
            : []).toEqual(['kid'])
    })

    it('asks someone with only an unpaid entry to finish paying', () => {
        expect(entryGate([entry('ann', { status: 'pending', holdExpiresAt: later })], now)).toMatchObject({
            kind: 'paymentPending',
            entry: { entryId: 'ann' },
        })
    })

    it('tells them when the name hold has ended', () => {
        expect(entryGate([entry('ann', { status: 'pending', holdExpiresAt: earlier })], now)).toMatchObject({
            kind: 'holdExpired',
        })
    })

    it('treats a hold ending exactly now as ended', () => {
        expect(entryGate([entry('ann', { status: 'pending', holdExpiresAt: now })], now).kind).toBe('holdExpired')
    })

    it('never treats a withdrawn entry as paid', () => {
        expect(entryGate([entry('ann', { status: 'withdrawn' })], now)).toEqual({ kind: 'withdrawn' })
    })

    it('offers to enter when there is no entry', () => {
        expect(entryGate([], now)).toEqual({ kind: 'noEntry' })
    })
})
