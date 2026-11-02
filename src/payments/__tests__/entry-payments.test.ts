// Created by Claude driven by Eddie Long on 2026-11-02.

import { describe, expect, it } from 'vitest'

import { displayNameKey } from '@/lib/display-name'

import { decideActivation } from '../activation'
import type { ActivationInput } from '../activation'
import { cleanDisplayName, nameWithSuffix, validateEntryForm } from '../entry-rules'

describe('validateEntryForm (Decision 17)', () => {
    it('accepts a normal name and email, tidying both', () => {
        expect(validateEntryForm({ displayName: '  Seán   M ', email: ' Sean@Example.IE ' })).toEqual({
            ok: true,
            displayName: 'Seán M',
            email: 'sean@example.ie',
        })
    })

    it('turns a typed apostrophe into a smart one', () => {
        expect(cleanDisplayName('Ciarán O\'Neill')).toBe('Ciarán O’Neill')
    })

    it.each([
        ['', 'nameRequired'],
        ['   ', 'nameRequired'],
        ['Aoife Kavanagh-Fitzgerald', 'nameTooLong'],
        ['<script>', 'nameCharacters'],
        ['Seán 🍀', 'nameCharacters'],
    ])('rejects the name “%s” with %s', (displayName, error) => {
        expect(validateEntryForm({ displayName, email: 'a@example.ie' })).toEqual({ ok: false, errors: { displayName: error } })
    })

    it('counts accented letters as one character each', () => {
        expect(validateEntryForm({ displayName: 'Pádraig Ó Súilleabh', email: 'a@example.ie' }).ok).toBe(true)
    })

    it('rejects a bad email address', () => {
        expect(validateEntryForm({ displayName: 'Aoife K', email: 'aoife' })).toEqual({ ok: false, errors: { email: 'emailInvalid' } })
    })

    it('reports both problems at once', () => {
        expect(validateEntryForm({ displayName: '', email: 'x' })).toEqual({
            ok: false,
            errors: { displayName: 'nameRequired', email: 'emailInvalid' },
        })
    })
})

describe('nameWithSuffix (Decision 18)', () => {
    it('adds (2) to a taken name', () => {
        expect(nameWithSuffix('Seán M', new Set([displayNameKey('Seán M')]))).toBe('Seán M (2)')
    })

    it('moves on to (3) when (2) is taken too', () => {
        const taken = new Set([displayNameKey('Seán M'), displayNameKey('Seán M (2)')])
        expect(nameWithSuffix('Seán M', taken)).toBe('Seán M (3)')
    })

    it('shortens a long name so the result still fits in 20 characters', () => {
        const name = 'Aoife Kavanagh-Fitzg'
        const result = nameWithSuffix(name, new Set([displayNameKey(name)]))
        expect([...result].length).toBeLessThanOrEqual(20)
        expect(result).toBe('Aoife Kavanagh-F (2)')
    })
})

describe('decideActivation (Decision 18)', () => {
    const base: ActivationInput = {
        kind: 'entry',
        paymentStatus: 'pending',
        entryStatus: 'pending',
        displayName: 'Seán M',
        takenKeys: new Set(),
        ownKey: displayNameKey('Seán M'),
        isBuybackOpen: true,
    }

    it('activates a pending entry under its own name', () => {
        expect(decideActivation(base)).toEqual({ kind: 'activate', displayName: 'Seán M', alert: null })
    })

    it('ignores an event Stripe has already sent', () => {
        expect(decideActivation({ ...base, paymentStatus: 'paid' })).toEqual({ kind: 'alreadyRecorded' })
        expect(decideActivation({ ...base, paymentStatus: 'refunded' })).toEqual({ kind: 'alreadyRecorded' })
    })

    it('still honours a payment that arrives after the hold ran out', () => {
        expect(decideActivation({ ...base, entryStatus: 'expired' })).toEqual({ kind: 'activate', displayName: 'Seán M', alert: null })
    })

    it('renames the entry when someone took the name in the meantime, and tells the admin', () => {
        const taken = { ...base, entryStatus: 'expired' as const, takenKeys: new Set([displayNameKey('Seán M')]) }
        expect(decideActivation(taken)).toEqual({ kind: 'activate', displayName: 'Seán M (2)', alert: 'renamed' })
    })

    it('records a payment for a withdrawn entry without bringing it back', () => {
        expect(decideActivation({ ...base, entryStatus: 'withdrawn' })).toEqual({ kind: 'recordOnly', alert: 'paidWhileWithdrawn' })
    })

    it('flags a second entry payment for an entry that is already paid', () => {
        expect(decideActivation({ ...base, entryStatus: 'active' })).toEqual({ kind: 'recordOnly', alert: 'duplicatePayment' })
    })

    it('applies a buy-back to an active entry', () => {
        expect(decideActivation({ ...base, kind: 'buyback', entryStatus: 'active' })).toEqual({ kind: 'buyback', alert: null })
    })

    it('still applies a buy-back paid just after the window closed, and tells the admin', () => {
        expect(decideActivation({ ...base, kind: 'buyback', entryStatus: 'active', isBuybackOpen: false })).toEqual({
            kind: 'buyback',
            alert: 'lateBuyback',
        })
    })

    it('records a buy-back for an entry that is not active', () => {
        expect(decideActivation({ ...base, kind: 'buyback', entryStatus: 'withdrawn' })).toEqual({
            kind: 'recordOnly',
            alert: 'buybackForInactiveEntry',
        })
    })
})
