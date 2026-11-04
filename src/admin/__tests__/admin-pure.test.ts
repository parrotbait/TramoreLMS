// Created by Claude driven by Eddie Long on 2026-11-04.

import { describe, expect, it } from 'vitest'

import { toCsv } from '../csv'
import { parseDublinDateTime, parseEuro, parseFixtureOverride, seasonOf, toDublinInputValue, withdrawalWeek } from '../forms'
import { moneyTotals } from '../money'
import type { MoneyPayment } from '../money'

describe('moneyTotals', () => {
    const payments: MoneyPayment[] = [
        { kind: 'entry', method: 'stripe', status: 'paid', amountCents: 1000, feeCents: 40 },
        { kind: 'entry', method: 'stripe', status: 'paid', amountCents: 1000, feeCents: 40 },
        { kind: 'entry', method: 'cash', status: 'paid', amountCents: 1000, feeCents: 0 },
        { kind: 'buyback', method: 'stripe', status: 'paid', amountCents: 500, feeCents: 33 },
        { kind: 'entry', method: 'stripe', status: 'refunded', amountCents: 1000, feeCents: 40 },
        { kind: 'entry', method: 'stripe', status: 'pending', amountCents: 1000, feeCents: 0 },
        { kind: 'entry', method: 'stripe', status: 'failed', amountCents: 1000, feeCents: 0 },
    ]
    const totals = moneyTotals(payments, 3000)

    it('counts only paid entries and buy-backs', () => {
        expect(totals).toMatchObject({
            entryCount: 3,
            entryCents: 3000,
            buybackCount: 1,
            buybackCents: 500,
            grossCents: 3500,
        })
    })

    it('shows refunds apart, never as money raised', () => {
        expect(totals.refundedCents).toBe(1000)
    })

    it('takes Stripe fees and the prize off the net', () => {
        expect(totals.feesCents).toBe(113)
        expect(totals.netRaisedCents).toBe(3500 - 113 - 3000)
    })

    it('splits money by how it was paid', () => {
        expect(totals.byMethod).toEqual({ stripe: 2500, cash: 1000, revolut: 0, other: 0 })
    })
})

describe('parseFixtureOverride', () => {
    it.each(['2-1', '2–1', '2:1', '2 1', ' 2 - 1 '])('reads “%s” as 2-1', (text) => {
        expect(parseFixtureOverride(text)).toEqual({ kind: 'set', override: { kind: 'result', home: 2, away: 1 } })
    })

    it('reads void and clear', () => {
        expect(parseFixtureOverride('Void')).toEqual({ kind: 'set', override: { kind: 'void' } })
        expect(parseFixtureOverride('clear')).toEqual({ kind: 'clear' })
    })

    it.each(['', 'two-one', '2-', '100-1'])('rejects “%s”', (text) => {
        expect(parseFixtureOverride(text)).toBeNull()
    })
})

describe('parseDublinDateTime', () => {
    it('reads winter time as UTC+0', () => {
        expect(parseDublinDateTime('2026-11-27T19:00')).toEqual(new Date('2026-11-27T19:00:00Z'))
    })

    it('reads summer time as UTC+1', () => {
        expect(parseDublinDateTime('2027-04-10T11:30')).toEqual(new Date('2027-04-10T10:30:00Z'))
    })

    it('handles the days either side of the clock change', () => {
        expect(parseDublinDateTime('2027-03-27T12:00')).toEqual(new Date('2027-03-27T12:00:00Z'))
        expect(parseDublinDateTime('2027-03-28T12:00')).toEqual(new Date('2027-03-28T11:00:00Z'))
    })

    it('rejects anything that is not a datetime-local value', () => {
        expect(parseDublinDateTime('27/11/2026 19:00')).toBeNull()
    })

    it('round-trips through the form value', () => {
        const instant = new Date('2027-04-10T10:30:00Z')
        expect(parseDublinDateTime(toDublinInputValue(instant))).toEqual(instant)
    })
})

describe('withdrawalWeek', () => {
    const weeks = [
        { number: 1, cutoffAt: new Date('2026-11-21T11:30:00Z') },
        { number: 2, cutoffAt: new Date('2026-11-27T19:00:00Z') },
        { number: 3, cutoffAt: null },
    ]

    it('withdraws from the first week whose cut-off has not passed', () => {
        expect(withdrawalWeek(weeks, new Date('2026-11-25T12:00:00Z'))).toBe(2)
    })

    it('still plays a week that is already locked', () => {
        expect(withdrawalWeek(weeks, new Date('2026-11-21T12:00:00Z'))).toBe(2)
    })

    it('withdraws from Week 1 before the competition starts', () => {
        expect(withdrawalWeek(weeks, new Date('2026-11-01T12:00:00Z'))).toBe(1)
    })
})

describe('seasonOf', () => {
    it('starts the next season in July', () => {
        expect(seasonOf(new Date('2026-11-04T12:00:00Z'))).toBe(2026)
        expect(seasonOf(new Date('2027-05-30T12:00:00Z'))).toBe(2026)
        expect(seasonOf(new Date('2027-07-01T12:00:00Z'))).toBe(2027)
    })

    it('uses Irish time at midnight on 1 July', () => {
        expect(seasonOf(new Date('2027-06-30T23:30:00Z'))).toBe(2027)
    })
})

describe('toCsv', () => {
    it('quotes cells and escapes quotes', () => {
        expect(toCsv([['Name', 'Note'], ['Seán “The Boss” M', 'Paid, cash']])).toBe(
            '"Name","Note"\r\n"Seán “The Boss” M","Paid, cash"\r\n',
        )
    })

    it('stops a cell running as a spreadsheet formula', () => {
        expect(toCsv([['=HYPERLINK("http://evil")', '+1', '-2', '@x']])).toBe(
            '"\'=HYPERLINK(""http://evil"")","\'+1","\'-2","\'@x"\r\n',
        )
    })

    it('leaves numbers alone, including negative ones', () => {
        expect(toCsv([[1000, -300, null]])).toBe('"1000","-300",""\r\n')
    })
})

describe('parseEuro', () => {
    it.each([
        ['10', 1000],
        ['10.50', 1050],
        ['€5', 500],
        ['€ 300', 30_000],
        ['7,5', 750],
        ['0', 0],
    ])('reads “%s” as %i cents', (text, cents) => {
        expect(parseEuro(text)).toBe(cents)
    })

    it.each(['', 'ten', '-5', '10.505', '99999'])('rejects “%s”', (text) => {
        expect(parseEuro(text)).toBeNull()
    })
})
