// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Renders both WhatsApp images with next/og and the real asset loader, the
// same way the routes do, and checks they are real PNGs of the right width.
// Set SHARE_PREVIEW_DIR to also save them for a look.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { ImageResponse } from 'next/og'
import { describe, expect, it } from 'vitest'

import { computeStandings } from '@/engine'
import { afterWeek, beforeCutoff, buildState } from '@/engine/testing/builder'
import type { ViewContext } from '@/view-models/context'

import { loadImageAssets } from '../assets'
import { IMAGE_WIDTH, picksImage, statusImage } from '../images'
import { picksImageModel, statusImageModel } from '../models'

const settings = {
    competitionName: 'Last Man Standing 2026/27',
    siteUrl: 'https://tramorelastmanstanding.vercel.app',
    prizeCents: 30_000,
    buybackFeeCents: 500,
}

const names = ['Aoife K', 'Bríd Ó', 'Ciarán M', 'Dara L', 'Éabha R', 'Fionn T', 'Gráinne S', 'Hugh B', 'Íde C', 'Jack W', 'Kate D', 'Liam O’S']
const state = buildState({
    weeks: [
        { fixtures: [['Arsenal', 'Chelsea', '2-0'], ['Everton', 'Fulham', '1-1'], ['Liverpool', 'Brentford', '0-1']] },
        { fixtures: [['Arsenal', 'Everton'], ['Chelsea', 'Fulham']] },
    ],
    entries: names,
    picks: Object.fromEntries(names.map((name, index) => {
        return [name, [['Arsenal', 'Arsenal', 'Brentford', 'Chelsea', 'Everton', 'Liverpool'][index % 6] ?? 'Arsenal']]
    })),
})
const slugs: Record<string, string> = { Arsenal: 'arsenal', Chelsea: 'chelsea', Everton: 'everton', Liverpool: 'liverpool', Brentford: 'brentford' }
const now = afterWeek(1)
const context: ViewContext = {
    state,
    standings: computeStandings(state, now),
    now,
    nameOf: (entryId) => {
        return entryId
    },
    plMatchdayOf: (weekNumber) => {
        return weekNumber + 11
    },
    crestOf: (teamId) => {
        const slug = slugs[teamId]
        return slug === undefined ? null : `/crests/${slug}.png`
    },
}

async function render(element: { element: React.ReactElement; height: number }): Promise<Buffer> {
    const response = new ImageResponse(element.element, { width: IMAGE_WIDTH, height: element.height })
    return Buffer.from(await response.arrayBuffer())
}

function pngSize(png: Buffer): { width: number; height: number } {
    return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('loadImageAssets', () => {
    it('reads only crests and the logo, and leaves a gap for anything else', async () => {
        const assets = await loadImageAssets(['/../.env.local', '/crests/../../package.json', '/crests/not-a-team.png'])

        expect(assets.crestOf('/../.env.local')).toBeNull()
        expect(assets.crestOf('/crests/../../package.json')).toBeNull()
        expect(assets.crestOf('/crests/not-a-team.png')).toBeNull()
    })
})

describe('WhatsApp images', () => {
    it('renders the status image as a 1080-wide PNG', async () => {
        const assets = await loadImageAssets([])
        expect(assets.logo).toMatch(/^data:image\/png;base64,/)

        const image = statusImage(statusImageModel(context, settings, 1), assets)
        const png = await render(image)

        expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE)
        expect(pngSize(png)).toEqual({ width: 1080, height: image.height })
        save('status.png', png)
    })

    it('renders the picks image as a 1080-wide PNG', async () => {
        const model = picksImageModel(context, settings, 1)
        const crestPaths = model.teams.flatMap((team) => {
            return team.crestUrl === null ? [] : [team.crestUrl]
        })
        const assets = await loadImageAssets(crestPaths)
        expect(assets.crestOf('/crests/arsenal.png')).toMatch(/^data:image\/png;base64,/)

        const image = picksImage(model, assets)
        const png = await render(image)

        expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE)
        expect(pngSize(png).width).toBe(1080)
        save('picks.png', png)
    })

    it('renders the picks image before the cut-off, with no teams', async () => {
        const early = { ...context, now: beforeCutoff(1), standings: computeStandings(state, beforeCutoff(1)) }
        const image = picksImage(picksImageModel(early, settings, 1), await loadImageAssets([]))
        const png = await render(image)

        expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE)
        save('picks-early.png', png)
    })
})

function save(fileName: string, png: Buffer) {
    const directory = process.env['SHARE_PREVIEW_DIR']
    if (directory !== undefined && directory !== '') {
        writeFileSync(join(directory, fileName), png)
    }
}
