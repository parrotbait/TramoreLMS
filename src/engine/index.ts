// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Public API of the rules engine. Import from here, not from the files inside.

export type {
    Entry,
    EntryId,
    Fixture,
    FixtureOverride,
    FixtureState,
    GameState,
    Pick,
    PickOverride,
    PickSource,
    Team,
    TeamId,
    Verdict,
    Week,
} from './types'

export { isBuybackAvailable, isBuybackWindowOpen } from './buyback'
export { computeCutoff } from './cutoff'
export { areEntriesOpen } from './entries'
export type { FixtureResolution, TeamResult } from './fixtures'
export { resolveWeekFixtures } from './fixtures'
export type { PickRejection, PickValidation } from './picks'
export {
    autoAssign,
    availableTeams,
    compareTeamNames,
    isEligibleForWeek,
    pickNeedsReplacing,
    validatePick,
} from './picks'
export type { PrizeSplit } from './prize'
export { splitPrize } from './prize'
export type { FeedReading, FeedScore, HoldReason, Reconciliation } from './reconcile'
export { reconcile } from './reconcile'
export type {
    CompetitionOutcome,
    EntryStanding,
    EntryStatus,
    EntryWeek,
    Standings,
    WeekReason,
} from './standings'
export { computeStandings, usedTeamIds } from './standings'
