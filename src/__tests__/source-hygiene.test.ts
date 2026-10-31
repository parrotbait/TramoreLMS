// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Source files must not contain bare combining accent marks. They are
// invisible, and they break accent-stripping regexes silently. Write them as
// escapes, for example in a character class from u0300 to u036f.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOTS = ['src', 'sim', 'scripts']
const COMBINING_MARK = /[\u0300-\u036f]/

function sourceFiles(directory: string): string[] {
    return readdirSync(directory).flatMap((name) => {
        const path = join(directory, name)
        if (statSync(path).isDirectory()) {
            return name === 'migrations' ? [] : sourceFiles(path)
        }

        return /\.(ts|tsx)$/.test(name) ? [path] : []
    })
}

describe('Source hygiene', () => {
    it('has no bare combining accent marks in code', () => {
        const offenders = ROOTS.flatMap(sourceFiles).filter((path) => {
            return COMBINING_MARK.test(readFileSync(path, 'utf8'))
        })

        expect(offenders).toEqual([])
    })
})
