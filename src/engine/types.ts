// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Core types for the rules engine. Everything here is plain data.
// The engine never reads the clock, the database or the network.

export type TeamId = string

export type EntryId = string

export interface Team {
    readonly id: TeamId
    /** Full official club name. Auto-assign sorts by this. */
    readonly fullName: string
}

export type FixtureState =
    | { readonly kind: 'scheduled' }
    | { readonly kind: 'finished'; readonly home: number; readonly away: number }
    | { readonly kind: 'postponed'; readonly at: Date }
    | { readonly kind: 'abandoned' }

export type FixtureOverride =
    | { readonly kind: 'result'; readonly home: number; readonly away: number }
    | { readonly kind: 'void' }

export interface Fixture {
    readonly id: string
    /** Competition week number (1-based), not the PL matchday. */
    readonly week: number
    readonly homeTeamId: TeamId
    readonly awayTeamId: TeamId
    readonly kickoffAt: Date
    readonly state: FixtureState
    readonly override?: FixtureOverride
}

export interface Week {
    readonly number: number
    /** Fixed when the week opens for picking. `null` until then. */
    readonly cutoffAt: Date | null
}

export interface Entry {
    readonly id: EntryId
    /** Paid the buy-back after going out in Week 1. */
    readonly boughtBack: boolean
    /** First week the entry no longer takes part in. */
    readonly withdrawnFromWeek?: number
}

export type PickSource =
    | 'player'
    | 'auto'
    | 'autoPass'

export interface Pick {
    readonly entryId: EntryId
    readonly week: number
    /** `null` only for an `autoPass`, when no team was available. */
    readonly teamId: TeamId | null
    readonly source: PickSource
}

export type Verdict =
    | 'through'
    | 'out'

export interface PickOverride {
    readonly entryId: EntryId
    readonly week: number
    readonly outcome: Verdict
}

export interface GameState {
    readonly teams: readonly Team[]
    readonly weeks: readonly Week[]
    /** The week that maps to PL matchday 38. */
    readonly finalWeek: number
    readonly fixtures: readonly Fixture[]
    /** Paid entries only. Pending (unpaid) entries are not part of the game. */
    readonly entries: readonly Entry[]
    readonly picks: readonly Pick[]
    readonly pickOverrides: readonly PickOverride[]
}
