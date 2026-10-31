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

/** For example “€300.00”. */
export function formatEuro(cents: number): string {
    return `€${(cents / 100).toFixed(2)}`
}
