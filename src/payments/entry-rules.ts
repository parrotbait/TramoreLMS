// Created by Claude driven by Eddie Long on 2026-11-02.
//
// Entry form rules (Decisions 17 and 18). Pure, so they are unit tested.

import { normaliseEmail } from '@/auth/rules'
import { displayNameKey } from '@/lib/display-name'

export const DISPLAY_NAME_MAX = 20
export const NAME_HOLD_MS = 60 * 60 * 1000

/** Letters (with accents), digits, spaces, apostrophes, hyphens and full stops. */
const NAME_PATTERN = /^[\p{L}\p{M}\p{N} .’-]+$/u

export type EntryFieldError =
    | 'nameRequired'
    | 'nameTooLong'
    | 'nameCharacters'
    | 'emailInvalid'

export interface EntryFormInput {
    readonly displayName: string
    readonly email: string
}

export type EntryFormResult =
    | { readonly ok: true; readonly displayName: string; readonly email: string }
    | { readonly ok: false; readonly errors: Readonly<Partial<Record<'displayName' | 'email', EntryFieldError>>> }

/** Trims, collapses spaces, and turns a typed apostrophe into a smart one. */
export function cleanDisplayName(raw: string): string {
    return raw.replace(/\s+/g, ' ').trim().replace(/'/g, '’')
}

export function validateEntryForm(input: EntryFormInput): EntryFormResult {
    const displayName = cleanDisplayName(input.displayName)
    const email = normaliseEmail(input.email)
    const errors: Partial<Record<'displayName' | 'email', EntryFieldError>> = {}

    if (displayName === '') {
        errors.displayName = 'nameRequired'
    } else if ([...displayName].length > DISPLAY_NAME_MAX) {
        errors.displayName = 'nameTooLong'
    } else if (!NAME_PATTERN.test(displayName)) {
        errors.displayName = 'nameCharacters'
    }

    if (email === null) {
        errors.email = 'emailInvalid'
    }

    if (email === null || Object.keys(errors).length > 0) {
        return { ok: false, errors }
    }

    return { ok: true, displayName, email }
}

export function holdExpiresAt(now: Date): Date {
    return new Date(now.getTime() + NAME_HOLD_MS)
}

/**
 * “Seán M” is taken, so “Seán M (2)”, then “Seán M (3)” …, shortening the
 * name so the result still fits in 20 characters.
 */
export function nameWithSuffix(displayName: string, takenKeys: ReadonlySet<string>): string {
    for (let number = 2; number < 100; number += 1) {
        const suffix = ` (${number})`
        const base = [...displayName].slice(0, DISPLAY_NAME_MAX - suffix.length).join('').trim()
        const candidate = `${base}${suffix}`
        if (!takenKeys.has(displayNameKey(candidate))) {
            return candidate
        }
    }

    throw new Error(`No free name for “${displayName}”`)
}

export function entryFieldMessage(error: EntryFieldError): string {
    switch (error) {
        case 'nameRequired':
            return 'Enter the name to show on the standings.'
        case 'nameTooLong':
            return `Keep it to ${DISPLAY_NAME_MAX} characters, for example “Seán M”.`
        case 'nameCharacters':
            return 'Use letters, numbers, spaces, apostrophes, hyphens or full stops.'
        case 'emailInvalid':
            return 'That doesn’t look like an email address.'
    }
}
