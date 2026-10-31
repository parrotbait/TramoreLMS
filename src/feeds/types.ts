// Created by Claude driven by Eddie Long on 2026-10-31.
//
// One match as the rest of the app sees it, whichever feed it came from.

import type { FeedScore } from '@/engine'

export type FeedStatus =
    | 'scheduled'
    | 'inPlay'
    | 'finished'
    | 'postponed'
    | 'cancelled'
    | 'abandoned'

export interface FeedTeam {
    /** Our club name (Decision 8), for example “Bournemouth”. */
    readonly name: string
    readonly crestUrl: string | null
}

export interface FeedMatch {
    /** The feed's own match id. */
    readonly externalId: number
    readonly matchday: number | null
    readonly kickoffAt: Date
    readonly status: FeedStatus
    readonly home: FeedTeam
    readonly away: FeedTeam
    /** Full-time score. Only set once the feed reports one. */
    readonly score: FeedScore | null
}
