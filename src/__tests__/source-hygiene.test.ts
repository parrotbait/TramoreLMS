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

    it('keeps website code off the file system', () => {
        // On Vercel, dynamic file paths make the bundler trace the whole project,
        // and public/ files are not in the server function at all.
        const websiteFiles = sourceFiles('src').filter((path) => {
            return !path.includes('__tests__')
        })
        const offenders = websiteFiles.filter((path) => {
            const source = readFileSync(path, 'utf8')
            return source.includes('from \'node:fs\'') || source.includes('/real-season')
        })

        expect(offenders).toEqual([])
    })

    it('never mentions build steps in what players see', () => {
        // Code comments may mention them. Page and component text must not.
        const files = [...sourceFiles('src/app'), ...sourceFiles('src/components')]
        const offenders = files.filter((path) => {
            const visible = readFileSync(path, 'utf8')
                .split('\n')
                .filter((line) => {
                    return !line.trim().startsWith('//')
                })
                .join('\n')
            return /build step|step \d+/i.test(visible)
        })

        expect(offenders).toEqual([])
    })
})
