// Created by Claude driven by Eddie Long on 2026-10-31.
//
// The week is shown the same way everywhere a player picks (requirement:
// “the match week is shown clearly wherever the user picks from”).

import { Countdown } from './Countdown'

interface WeekBannerProps {
    readonly weekNumber: number
    readonly plMatchday: number
    readonly cutoffLabel: string | null
    readonly cutoffIso: string | null
    readonly nowIso: string
}

export function WeekBanner({ weekNumber, plMatchday, cutoffLabel, cutoffIso, nowIso }: WeekBannerProps) {
    return (
        <section className="rounded-2xl bg-gold px-4 py-3 text-on-gold shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide">PL Matchday {plMatchday}</p>
            <h2 className="text-2xl font-bold">Week {weekNumber}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <span>
                    Cut-off <strong>{cutoffLabel ?? 'not set yet'}</strong>
                </span>
                {cutoffIso !== null ? <Countdown cutoffIso={cutoffIso} nowIso={nowIso} /> : null}
            </div>
        </section>
    )
}
