// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Decides whether a result can be applied automatically (Decisions 3 and 20).
// football-data.org is the primary feed. FPL is the cross-check.

const SECONDARY_GRACE_MS = 6 * 60 * 60 * 1000

export interface FeedScore {
    readonly home: number
    readonly away: number
}

export interface FeedReading {
    readonly finished: boolean
    readonly score: FeedScore | null
}

export type HoldReason =
    | 'scoresDisagree'
    | 'secondaryMissing'

export type Reconciliation =
    | { readonly kind: 'wait' }
    | { readonly kind: 'hold'; readonly reason: HoldReason }
    | { readonly kind: 'accept'; readonly score: FeedScore }

/**
 * Accept only when both feeds show the match finished with the same score.
 * If the cross-check has not caught up 6 hours after kick-off, hold the
 * result for the admin.
 */
export function reconcile(
    primary: FeedReading,
    secondary: FeedReading | undefined,
    kickoffAt: Date,
    now: Date,
): Reconciliation {
    if (!primary.finished || primary.score === null) {
        return { kind: 'wait' }
    }

    if (secondary === undefined || !secondary.finished || secondary.score === null) {
        const isPastGrace = now.getTime() - kickoffAt.getTime() > SECONDARY_GRACE_MS
        return isPastGrace ? { kind: 'hold', reason: 'secondaryMissing' } : { kind: 'wait' }
    }

    const isSameScore = primary.score.home === secondary.score.home
        && primary.score.away === secondary.score.away
    if (!isSameScore) {
        return { kind: 'hold', reason: 'scoresDisagree' }
    }

    return { kind: 'accept', score: primary.score }
}
