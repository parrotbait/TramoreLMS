// Created by Claude driven by Eddie Long on 2026-11-04.
//
// The logo and crests for the WhatsApp images, read from public/ and passed
// to Satori as data URIs. Satori won't fetch from a private address such as
// localhost (SSRF protection), and a site fetching itself is fragile anyway.
//
// Server only. On Vercel, public/ is not in a function's file system, so
// next.config.ts traces public/brand and public/crests into the share routes.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { brand } from '@/theme/tokens'

import type { ImageAssets } from './images'

/** Only these public files can be read: the logo and crests. */
const ALLOWED_PATH = /^\/(brand|crests)\/[a-z0-9-]+\.png$/

/** Reads the logo and the given crests (public paths such as `/crests/arsenal.png`). */
export async function loadImageAssets(crestPaths: readonly string[]): Promise<ImageAssets> {
    const paths = [...new Set(crestPaths)].filter((path) => {
        return ALLOWED_PATH.test(path)
    })
    const [logo, ...crests] = await Promise.all([brand.logoPath, ...paths].map(dataUriOf))
    const byPath = new Map(paths.map((path, index) => {
        return [path, crests[index] ?? null]
    }))

    return {
        logo: logo ?? '',
        crestOf: (path) => {
            return byPath.get(path) ?? null
        },
    }
}

async function dataUriOf(publicPath: string): Promise<string | null> {
    try {
        const bytes = await readFile(join(process.cwd(), 'public', publicPath))
        return `data:image/png;base64,${bytes.toString('base64')}`
    } catch {
        return null
    }
}
