// Created by Claude driven by Eddie Long on 2026-10-31.

export interface PrizeSplit {
    readonly perWinnerCents: number
    /** Cents left over after an equal split. They stay with the club. */
    readonly remainderCents: number
}

/** Rule 6: survivors share the prize equally. */
export function splitPrize(prizeCents: number, winnerCount: number): PrizeSplit {
    if (winnerCount <= 0) {
        return { perWinnerCents: 0, remainderCents: prizeCents }
    }

    const perWinnerCents = Math.floor(prizeCents / winnerCount)

    return { perWinnerCents, remainderCents: prizeCents - perWinnerCents * winnerCount }
}
