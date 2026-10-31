// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Player-facing wording. Smart quotes throughout.

import type { PickRejection } from '@/engine'

export function pickRejectionMessage(reason: PickRejection): string {
    switch (reason) {
        case 'cutoffPassed':
            return 'The cut-off has passed. Picks for this week are locked.'
        case 'teamUsed':
            return 'You’ve already used that team.'
        case 'teamNotAvailable':
            return 'That team isn’t available this week.'
        case 'notEligible':
            return 'You’re not in this week.'
        case 'unknownWeek':
        case 'weekNotOpen':
            return 'Picks for this week aren’t open yet.'
    }
}
