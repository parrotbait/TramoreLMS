// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Club crests, stored with the site in public/crests/<team-id>.<ext>.
// They are downloaded once from football-data.org, never hotlinked.
// Server only: this reads the file system.

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const CREST_FILE = /^([a-z0-9-]+)\.(png|svg|webp)$/

export const crestDirectory = join(process.cwd(), 'public', 'crests')

/** Team id to public URL, for every crest file present. */
export function loadCrestIndex(): ReadonlyMap<string, string> {
    if (!existsSync(crestDirectory)) {
        return new Map()
    }

    const index = new Map<string, string>()
    for (const file of readdirSync(crestDirectory)) {
        const match = CREST_FILE.exec(file)
        if (match?.[1] !== undefined) {
            index.set(match[1], `/crests/${file}`)
        }
    }

    return index
}
