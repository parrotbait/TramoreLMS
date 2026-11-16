// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Display formatting shared by the site, emails and the simulator.
// All times are shown in Irish time (Decision 12).

const dublinDateTime = new Intl.DateTimeFormat('en-IE', {
    timeZone: 'Europe/Dublin',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
})

/** For example “Sat 21 Nov, 11:30”. */
export function formatDublin(date: Date): string {
    const parts = dublinDateTime.formatToParts(date)
    const part = (type: Intl.DateTimeFormatPartTypes) => {
        return parts.find((candidate) => {
            return candidate.type === type
        })?.value ?? ''
    }

    return `${part('weekday')} ${part('day')} ${part('month')}, ${part('hour')}:${part('minute')}`
}

const dublinDay = new Intl.DateTimeFormat('en-IE', {
    timeZone: 'Europe/Dublin',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
})

const dublinTime = new Intl.DateTimeFormat('en-IE', {
    timeZone: 'Europe/Dublin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
})

const dublinDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Dublin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
})

/** The Irish day, for example “Sat 21 Nov”. */
export function formatDublinDay(date: Date): string {
    return dublinDay.format(date).replace(',', '')
}

/** The Irish time of day, for example “11:30”. */
export function formatDublinTime(date: Date): string {
    return dublinTime.format(date)
}

/** The Irish calendar day as “2026-11-21”. A match at 00:30 Irish time belongs to the new day. */
export function dublinDayKey(date: Date): string {
    return dublinDate.format(date)
}

/** For example “€300.00”. */
export function formatEuro(cents: number): string {
    return `€${(cents / 100).toFixed(2)}`
}
