// Created by Claude driven by Eddie Long on 2026-10-31.
//
// A competition held in memory. It applies events the same way the real
// server will: every pick goes through validatePick, every lock through
// autoAssign, every result through reconcile.

import {
    autoAssign,
    computeCutoff,
    computeStandings,
    isBuybackAvailable,
    reconcile,
    validatePick,
} from '@/engine'
import type {
    Entry,
    EntryId,
    FeedScore,
    Fixture,
    FixtureOverride,
    GameState,
    Pick,
    PickOverride,
    PickValidation,
    Standings,
    Team,
    TeamId,
    Verdict,
    Week,
} from '@/engine'

export interface FixtureSeed {
    readonly homeTeamId: TeamId
    readonly awayTeamId: TeamId
    readonly kickoffAt: Date
}

export type BuybackResult =
    | 'boughtBack'
    | 'buybackUnavailable'

export interface HeldFixture {
    readonly fixtureId: string
    readonly reason: string
}

export class SimCompetition {
    private readonly teams: readonly Team[]
    private readonly finalWeek: number
    private weeks: Week[] = []
    private fixtures: Fixture[] = []
    private entries: Entry[]
    private picks: Pick[] = []
    private pickOverrides: PickOverride[] = []
    private held: HeldFixture[] = []

    constructor(teams: readonly Team[], entryIds: readonly EntryId[], finalWeek: number) {
        this.teams = teams
        this.finalWeek = finalWeek
        this.entries = entryIds.map((id) => {
            return { id, boughtBack: false }
        })
    }

    get state(): GameState {
        return {
            teams: this.teams,
            weeks: this.weeks,
            finalWeek: this.finalWeek,
            fixtures: this.fixtures,
            entries: this.entries,
            picks: this.picks,
            pickOverrides: this.pickOverrides,
        }
    }

    get heldFixtures(): readonly HeldFixture[] {
        return this.held
    }

    teamName(teamId: TeamId | null): string {
        if (teamId === null) {
            return 'Pass'
        }

        return this.teams.find((team) => {
            return team.id === teamId
        })?.fullName ?? teamId
    }

    fixturesOf(weekNumber: number): readonly Fixture[] {
        return this.fixtures.filter((fixture) => {
            return fixture.week === weekNumber
        })
    }

    pickOf(entryId: EntryId, weekNumber: number): Pick | undefined {
        return this.picks.find((pick) => {
            return pick.entryId === entryId && pick.week === weekNumber
        })
    }

    standings(now: Date): Standings {
        return computeStandings(this.state, now)
    }

    addWeek(weekNumber: number, seeds: readonly FixtureSeed[]): readonly Fixture[] {
        const added: Fixture[] = seeds.map((seed) => {
            return {
                id: `w${weekNumber}-${seed.homeTeamId}-${seed.awayTeamId}`,
                week: weekNumber,
                homeTeamId: seed.homeTeamId,
                awayTeamId: seed.awayTeamId,
                kickoffAt: seed.kickoffAt,
                state: { kind: 'scheduled' },
            }
        })

        this.fixtures.push(...added)
        this.weeks.push({ number: weekNumber, cutoffAt: null })

        return added
    }

    /** Fixes the cut-off from the fixtures as they stand at `at` (Decision 12). */
    openWeek(weekNumber: number, at: Date): Date | null {
        const cutoffAt = computeCutoff(this.fixturesOf(weekNumber), at)
        this.replaceWeek({ number: weekNumber, cutoffAt })

        return cutoffAt
    }

    pick(entryId: EntryId, weekNumber: number, teamId: TeamId, now: Date): PickValidation {
        const validation = validatePick(this.state, now, entryId, weekNumber, teamId)
        if (!validation.ok) {
            return validation
        }

        this.savePicks([{ entryId, week: weekNumber, teamId, source: 'player' }])
        return validation
    }

    /** Runs auto-assign and saves the result. Returns the new picks. */
    lock(weekNumber: number, now: Date): readonly Pick[] {
        const assigned = autoAssign(this.state, now, weekNumber)
        this.savePicks(assigned)

        return assigned
    }

    postpone(fixtureId: string, at: Date) {
        this.updateFixture(fixtureId, (fixture) => {
            return { ...fixture, state: { kind: 'postponed', at } }
        })
    }

    abandon(fixtureId: string) {
        this.updateFixture(fixtureId, (fixture) => {
            return { ...fixture, state: { kind: 'abandoned' } }
        })
    }

    /** Applies a result only when the two feeds agree. Otherwise holds it for the admin. */
    report(fixtureId: string, primary: FeedScore, secondary: FeedScore | null, now: Date) {
        const fixture = this.requireFixture(fixtureId)
        const reconciliation = reconcile(
            { finished: true, score: primary },
            secondary === null ? undefined : { finished: true, score: secondary },
            fixture.kickoffAt,
            now,
        )

        switch (reconciliation.kind) {
            case 'wait':
                return
            case 'hold':
                this.held.push({ fixtureId, reason: reconciliation.reason })
                return
            case 'accept':
                break
        }

        this.updateFixture(fixtureId, (current) => {
            return {
                ...current,
                state: { kind: 'finished', home: reconciliation.score.home, away: reconciliation.score.away },
            }
        })
    }

    overrideFixture(fixtureId: string, override: FixtureOverride) {
        this.held = this.held.filter((held) => {
            return held.fixtureId !== fixtureId
        })
        this.updateFixture(fixtureId, (fixture) => {
            return { ...fixture, override }
        })
    }

    overridePick(entryId: EntryId, weekNumber: number, outcome: Verdict) {
        this.pickOverrides = [
            ...this.pickOverrides.filter((override) => {
                return !(override.entryId === entryId && override.week === weekNumber)
            }),
            { entryId, week: weekNumber, outcome },
        ]
    }

    buyBack(entryId: EntryId, now: Date): BuybackResult {
        const isAvailable = isBuybackAvailable(this.state, this.standings(now), now, entryId)
        if (!isAvailable) {
            return 'buybackUnavailable'
        }

        this.replaceEntry(entryId, (entry) => {
            return { ...entry, boughtBack: true }
        })
        return 'boughtBack'
    }

    withdraw(entryId: EntryId, fromWeek: number) {
        this.replaceEntry(entryId, (entry) => {
            return { ...entry, withdrawnFromWeek: fromWeek }
        })
    }

    private savePicks(newPicks: readonly Pick[]) {
        this.picks = [
            ...this.picks.filter((existing) => {
                return !newPicks.some((pick) => {
                    return pick.entryId === existing.entryId && pick.week === existing.week
                })
            }),
            ...newPicks,
        ]
    }

    private replaceWeek(week: Week) {
        this.weeks = this.weeks.map((existing) => {
            return existing.number === week.number ? week : existing
        })
    }

    private replaceEntry(entryId: EntryId, change: (entry: Entry) => Entry) {
        this.entries = this.entries.map((entry) => {
            return entry.id === entryId ? change(entry) : entry
        })
    }

    private requireFixture(fixtureId: string): Fixture {
        const fixture = this.fixtures.find((candidate) => {
            return candidate.id === fixtureId
        })
        if (fixture === undefined) {
            throw new Error(`No fixture ${fixtureId}`)
        }

        return fixture
    }

    private updateFixture(fixtureId: string, change: (fixture: Fixture) => Fixture) {
        this.requireFixture(fixtureId)
        this.fixtures = this.fixtures.map((fixture) => {
            return fixture.id === fixtureId ? change(fixture) : fixture
        })
    }
}
