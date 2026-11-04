// Created by Claude driven by Eddie Long on 2026-11-04.

import { describe, expect, it } from 'vitest'

import { isUuid } from '../ids'

describe('isUuid', () => {
    it('accepts the ids Postgres makes', () => {
        expect(isUuid('a61a106f-271d-4a17-a5ff-f6a7093c3ea1')).toBe(true)
        expect(isUuid('A61A106F-271D-4A17-A5FF-F6A7093C3EA1')).toBe(true)
    })

    it.each([
        '3',
        '',
        'a61a106f-271d-4a17-a5ff',
        'a61a106f271d4a17a5fff6a7093c3ea1',
        'a61a106f-271d-4a17-a5ff-f6a7093c3ea1\' or 1=1',
        null,
        undefined,
        3,
    ])('rejects %p', (value) => {
        expect(isUuid(value)).toBe(false)
    })
})
