// Created by Claude driven by Eddie Long on 2026-11-01.
//
// Club crests, stored with the site in public/crests/<team-slug>.<ext> and
// listed in crest-manifest.json. Both are written by `pnpm sim --fetch`.
//
// The manifest is imported, not read from disk: on Vercel, public/ files are
// served by the CDN and are not in the server function's file system.

import manifest from './crest-manifest.json'

const crests: Readonly<Record<string, string>> = manifest

/** Public URL of the crest for a team slug, or `null` to show initials. */
export function crestUrlOf(teamSlug: string): string | null {
    return crests[teamSlug] ?? null
}
