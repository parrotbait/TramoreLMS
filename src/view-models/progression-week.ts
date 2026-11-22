// Created by Claude driven by Eddie Long on 2026-11-22.
//
// Which week the standings grid opens on. In its own file, with no imports of
// code, so the grid in the browser does not pull the rules engine with it.

interface WeekColumn {
    readonly number: number
    /** Players still in after this week. `null` until the week settles. */
    readonly survivorsAfter: number | null
}

/**
 * The first week that has not settled, as that is where the game is now.
 * After the last week has settled, the last week. `null` if there are no weeks.
 */
export function currentProgressionWeek(weeks: readonly WeekColumn[]): number | null {
    const live = weeks.find((week) => {
        return week.survivorsAfter === null
    })

    return live?.number ?? weeks.at(-1)?.number ?? null
}
