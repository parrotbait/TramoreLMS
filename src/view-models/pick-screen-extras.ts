// Created by Claude driven by Eddie Long on 2026-11-22.
//
// Small facts that make the pick screen worth opening: what the crowd picked
// once picks close, which team we would pick for you if you
// do nothing, and why you are out. Pure, so each one is tested.

import { availableTeams } from '@/engine'
import type { EntryId, TeamId } from '@/engine'

import { fixtureScoreLabel, fixturesOf, teamNameOf } from './context'
import type { ViewContext } from './context'

export interface Crowd {
    readonly topTeamName: string
    readonly topCount: number
    /** Players who picked a team this week. */
    readonly total: number
    /** Players who picked the same team as this player, this player included. `0` if they picked nothing. */
    readonly yourCount: number
}

/** What everyone picked this week. Only call it once picks have closed. `null` if nobody picked. */
export function crowdOf(context: ViewContext, entryId: EntryId, weekNumber: number): Crowd | null {
    const counts = new Map<TeamId, number>()
    let yourTeam: TeamId | null = null

    for (const [id, standing] of context.standings.entries) {
        const teamId = standing.weeks.find((entryWeek) => {
            return entryWeek.week === weekNumber
        })?.pick?.teamId
        if (teamId === undefined || teamId === null) {
            continue
        }

        counts.set(teamId, (counts.get(teamId) ?? 0) + 1)
        if (id === entryId) {
            yourTeam = teamId
        }
    }

    const ranked = [...counts].sort(([leftTeam, leftCount], [rightTeam, rightCount]) => {
        return rightCount - leftCount || teamNameOf(context, leftTeam).localeCompare(teamNameOf(context, rightTeam), 'en')
    })
    const top = ranked[0]
    if (top === undefined) {
        return null
    }

    return {
        topTeamName: teamNameOf(context, top[0]),
        topCount: top[1],
        total: [...counts.values()].reduce((sum, count) => {
            return sum + count
        }, 0),
        yourCount: yourTeam === null ? 0 : counts.get(yourTeam) ?? 0,
    }
}

/**
 * The team we would pick for a player who does nothing: the first one the
 * engine would auto-assign at the cut-off. `null` if there is none.
 */
export function fallbackTeamName(
    context: ViewContext,
    entryId: EntryId,
    weekNumber: number,
    asOf: Date,
): string | null {
    const first = availableTeams(context.state, context.standings, entryId, weekNumber, asOf)[0]

    return first === undefined ? null : first.fullName
}

/** Why a player is out, in a sentence or two, for the week they went out. `null` if they never went out. */
export function outCauseOf(context: ViewContext, entryId: EntryId): string | null {
    const weeks = context.standings.entries.get(entryId)?.weeks ?? []
    const lost = [...weeks].reverse().find((entryWeek) => {
        return entryWeek.outcome === 'out' && !entryWeek.reinstated
    })
    if (lost === undefined) {
        return null
    }

    const teamId = lost.pick?.teamId
    const picked = teamId === undefined || teamId === null ? null : teamNameOf(context, teamId)
    const fixture = teamId === undefined || teamId === null
        ? undefined
        : fixturesOf(context, lost.week).find((candidate) => {
            return candidate.homeTeamId === teamId || candidate.awayTeamId === teamId
        })
    const score = fixture === undefined ? null : fixtureScoreLabel(fixture)

    const verdict = lost.reason === 'draw'
        ? 'A draw is out.'
        : lost.reason === 'loss'
            ? 'A loss is out.'
            : lost.reason === 'pickOverride' ? 'The organiser put you out.' : ''
    const result = fixture === undefined || score === null
        ? ''
        : ` ${teamNameOf(context, fixture.homeTeamId)} ${score} ${teamNameOf(context, fixture.awayTeamId)}.`
    const pickedText = picked === null ? '' : ` You picked ${picked}.`

    return `Week ${lost.week}:${pickedText}${result} ${verdict}`.replace(/\s+/g, ' ').trim()
}

/** The lines shown under “Picks are closed”, in very simple English. */
export function crowdLines(crowd: Crowd, yourTeamName: string | null): readonly string[] {
    const lines = [`Most popular pick: ${crowd.topTeamName}, with ${crowd.topCount} of ${crowd.total} players.`]

    if (yourTeamName === null || crowd.yourCount === 0) {
        return lines
    }

    if (crowd.yourCount === 1) {
        lines.push(crowd.total === 1 ? `You are the only one who picked ${yourTeamName}.` : `Only you picked ${yourTeamName}.`)
    } else {
        const others = crowd.yourCount - 1
        lines.push(`You picked ${yourTeamName} with ${others} ${others === 1 ? 'other player' : 'other players'}.`)
    }

    return lines
}
