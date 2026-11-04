// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Parsing what the admin types. Pure, so it is unit tested.

import type { FixtureOverride, Week } from '@/engine'

export type OverrideInput =
    | { readonly kind: 'set'; readonly override: FixtureOverride }
    | { readonly kind: 'clear' }

/** “10”, “10.50”, “€10” or “10,50” → cents. `null` if it is not an amount of 0 to €10,000. */
export function parseEuro(text: string): number | null {
    const value = text.trim().replace(/^€\s*/, '').replace(',', '.')
    if (!/^\d{1,5}(\.\d{1,2})?$/.test(value)) {
        return null
    }

    const cents = Math.round(Number(value) * 100)
    return cents <= 1_000_000 ? cents : null
}

/** “2-1”, “2–1” or “2 1” for a result, “void”, or “clear” to go back to the feed. */
export function parseFixtureOverride(text: string): OverrideInput | null {
    const value = text.trim().toLowerCase()
    if (value === 'void') {
        return { kind: 'set', override: { kind: 'void' } }
    }

    if (value === 'clear') {
        return { kind: 'clear' }
    }

    const match = /^(\d{1,2})\s*[-–:\s]\s*(\d{1,2})$/.exec(value)
    if (match === null) {
        return null
    }

    return { kind: 'set', override: { kind: 'result', home: Number(match[1]), away: Number(match[2]) } }
}

/**
 * Reads a `datetime-local` value (“2026-11-27T19:00”) as Irish time and
 * returns the instant. Correct on both sides of the clock change.
 */
export function parseDublinDateTime(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim())
    if (match === null) {
        return null
    }

    const [, year, month, day, hour, minute] = match.map(Number) as [number, number, number, number, number, number]
    const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute)

    // Dublin is UTC+0 or UTC+1. Guess, check the offset at that instant, and correct.
    let instant = wallClockAsUtc
    for (let attempt = 0; attempt < 2; attempt += 1) {
        instant = wallClockAsUtc - dublinOffsetMs(new Date(instant))
    }

    return new Date(instant)
}

/** For a `datetime-local` input: the instant shown as Irish wall-clock time. */
export function toDublinInputValue(date: Date): string {
    const parts = dublinParts(date)
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

/**
 * The Premier League season a new competition is for, by its start year.
 * Seasons run August to May, so from July a new one is next.
 * For example, 1 Aug 2027 gives 2027 (the 2027/28 season).
 */
export function seasonOf(now: Date): number {
    const parts = dublinParts(now)
    const year = Number(parts.year)
    return Number(parts.month) >= 7 ? year : year - 1
}

/**
 * The week a withdrawn entry stops playing from: the first week whose
 * cut-off has not passed. A week already locked is still played.
 */
export function withdrawalWeek(weeks: readonly Week[], now: Date): number {
    const sorted = [...weeks].sort((left, right) => {
        return left.number - right.number
    })
    const open = sorted.find((week) => {
        return week.cutoffAt === null || week.cutoffAt.getTime() > now.getTime()
    })
    if (open !== undefined) {
        return open.number
    }

    return (sorted.at(-1)?.number ?? 0) + 1
}

function dublinOffsetMs(date: Date): number {
    const parts = dublinParts(date)
    const asUtc = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
    )

    return asUtc - Math.floor(date.getTime() / 60_000) * 60_000
}

const dublinFormat = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Dublin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
})

function dublinParts(date: Date): Record<'year' | 'month' | 'day' | 'hour' | 'minute', string> {
    const parts = dublinFormat.formatToParts(date)
    const get = (type: Intl.DateTimeFormatPartTypes) => {
        return parts.find((part) => {
            return part.type === type
        })?.value ?? '00'
    }

    return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') }
}
