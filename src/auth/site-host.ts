// Created by Claude driven by Eddie Long on 2026-11-25.
//
// Which address to send someone back to. The club may have two addresses for
// the same site, for example tramorelastmanstanding.ie and the .vercel.app
// one. A cookie belongs to one address. If a player starts on one address and
// we send them back on the other, the browser leaves the cookie behind and
// they are not signed in.
//
// So we use the address the request came in on, when it is one of ours. An
// address is ours if it is SITE_URL, Vercel’s own production address, or listed
// in SITE_ALIASES (comma-separated, for example “tramorelastmanstanding.ie”).
// Anything else gets SITE_URL, so a made-up Host header can’t steer a link anywhere.

import { normaliseSiteUrl } from './rules'

export interface SiteHostInput {
    /** The Host the request came in on, for example “tramorelastmanstanding.ie”. */
    readonly host: string | null
    /** siteUrl(): where we send people when the request address isn’t ours. */
    readonly canonical: string
    /** SITE_ALIASES. */
    readonly aliases: string | undefined
    /** VERCEL_PROJECT_PRODUCTION_URL. */
    readonly vercelProduction: string | undefined
}

function hostOf(address: string): string | null {
    try {
        return new URL(normaliseSiteUrl(address)).host.toLowerCase()
    } catch {
        return null
    }
}

export function resolveSiteUrl(input: SiteHostInput): string {
    const host = input.host?.trim().toLowerCase() ?? ''
    if (host === '') {
        return input.canonical
    }

    const ours = new Set<string>()
    const add = (address: string | undefined) => {
        const found = address === undefined || address.trim() === '' ? null : hostOf(address)
        if (found !== null) {
            ours.add(found)
        }
    }
    add(input.canonical)
    add(input.vercelProduction)
    for (const alias of (input.aliases ?? '').split(',')) {
        add(alias)
    }

    if (!ours.has(host)) {
        return input.canonical
    }

    // Local development is plain http. Everything else is https.
    const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1')
    return `${isLocal ? 'http' : 'https'}://${host}`
}
