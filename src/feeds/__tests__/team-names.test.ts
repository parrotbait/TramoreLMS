// Created by Claude driven by Eddie Long on 2026-10-31.

import { describe, expect, it } from 'vitest'

import { canonicalTeamName } from '../team-names'

describe('canonicalTeamName (Decision 8)', () => {
    it.each([
        ['Arsenal FC', 'Arsenal'],
        ['AFC Bournemouth', 'Bournemouth'],
        ['Brighton & Hove Albion FC', 'Brighton & Hove Albion'],
        ['Wolverhampton Wanderers FC', 'Wolverhampton Wanderers'],
        ['Nottingham Forest FC', 'Nottingham Forest'],
        ['Tottenham Hotspur FC', 'Tottenham Hotspur'],
        ['Sunderland AFC', 'Sunderland'],
        ['Liverpool', 'Liverpool'],
    ])('turns "%s" into "%s"', (feedName, expected) => {
        expect(canonicalTeamName(feedName)).toBe(expected)
    })
})
