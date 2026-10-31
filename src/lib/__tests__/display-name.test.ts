// Created by Claude driven by Eddie Long on 2026-10-31.

import { describe, expect, it } from 'vitest'

import { displayNameKey } from '../display-name'

describe('displayNameKey (Decision 17)', () => {
    it.each([
        ['Seán M', 'sean m'],
        ['SEAN  M', 'sean m'],
        ['  Aoife K ', 'aoife k'],
        ['Róisín', 'roisin'],
    ])('turns "%s" into "%s"', (name, expected) => {
        expect(displayNameKey(name)).toBe(expected)
    })

    it('treats names that differ only in case and accents as the same', () => {
        expect(displayNameKey('Seán M')).toBe(displayNameKey('sean m'))
    })
})
