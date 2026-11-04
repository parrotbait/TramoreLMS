// Created by Claude driven by Eddie Long on 2026-11-04.
//
// The rules page text (PLAN.md section 2), in very simple English. Values
// come from the competition, so the fee, prize and team order are always
// right. Pure, so it is tested.

import { compareTeamNames } from '@/engine'
import { formatEuro } from '@/lib/format'

/** `null` amounts, before a competition is set up, read as words. */
export interface RulesSettings {
    readonly buybackFeeCents: number | null
    readonly prizeCents: number | null
    /** Full club names of the teams in the competition. */
    readonly teamNames: readonly string[]
}

export interface RuleSection {
    readonly title: string
    readonly lines: readonly string[]
}

export interface RulesContent {
    readonly sections: readonly RuleSection[]
    /** The order used to pick a team for you. */
    readonly teamOrder: readonly string[]
    readonly closing: string
}

export function rulesContent(settings: RulesSettings): RulesContent {
    const buyback = settings.buybackFeeCents === null ? 'a small fee' : formatEuro(settings.buybackFeeCents)
    const prize = settings.prizeCents === null ? 'the prize' : formatEuro(settings.prizeCents)

    return {
        sections: [
            {
                title: 'Pick one team each week',
                lines: [
                    'Each week is one round of Premier League games.',
                    'If your team wins, you are through.',
                    'If your team draws or loses, you are out.',
                ],
            },
            {
                title: 'Use each team once',
                lines: [
                    'You can pick a team only once.',
                    'This counts teams picked for you, and games that were called off.',
                ],
            },
            {
                title: 'The cut-off',
                lines: [
                    'The cut-off is 1 hour before the first game of the week.',
                    'You can change your pick until then.',
                    'If you have no pick at the cut-off, we pick for you.',
                    'We give you the first team on the list below that you have not used and that plays that week.',
                ],
            },
            {
                title: 'Buy back after Week 1',
                lines: [
                    `If you go out in Week 1, you can buy back in for ${buyback}.`,
                    'You must do this before the Week 2 cut-off.',
                    'Your Week 1 team stays used.',
                    'You can’t buy back after any other week.',
                ],
            },
            {
                title: 'Games that are moved or stopped',
                lines: [
                    'Moved before the cut-off: pick again. If you don’t, we pick for you.',
                    'Moved or called off after the cut-off: you are through, and the team is used.',
                    'Stopped during the game: the league’s result counts. If there is no result by the end of the week, it counts as called off.',
                ],
            },
            {
                title: 'How it ends',
                lines: [
                    `If one player is left, they win ${prize}.`,
                    'If everyone left goes out in the same week, they all stay in.',
                    `If more than one player is left after the last week of the season, they share ${prize}.`,
                ],
            },
            {
                title: 'Refunds',
                lines: [
                    'You can get your money back before the Week 1 cut-off.',
                    'No refunds after that.',
                ],
            },
            {
                title: 'Anything else',
                lines: [
                    'If the rules don’t cover something, the organiser decides.',
                ],
            },
        ],
        teamOrder: teamOrder(settings.teamNames),
        closing: 'All money after the prize goes to Tramore Athletic.',
    }
}

/** The same order the auto-pick uses (Decision 8). */
export function teamOrder(teamNames: readonly string[]): readonly string[] {
    return [...teamNames].sort(compareTeamNames)
}
