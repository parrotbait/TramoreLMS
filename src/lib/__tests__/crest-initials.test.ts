// Created by Claude driven by Eddie Long on 2026-10-31.

import { describe, expect, it } from 'vitest'

import { teamInitials } from '../crest-initials'

describe('teamInitials', () => {
    it.each([
        ['Arsenal', 'ARS'],
        ['Aston Villa', 'AV'],
        ['Brighton & Hove Albion', 'BHA'],
        ['Wolverhampton Wanderers', 'WW'],
        ['West Ham United', 'WHU'],
    ])('turns "%s" into "%s"', (name, expected) => {
        expect(teamInitials(name)).toBe(expected)
    })
})
