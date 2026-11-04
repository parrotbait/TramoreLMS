// Created by Claude driven by Eddie Long on 2026-11-04.
//
// The picks-revealed image (PNG) for WhatsApp: players per team, no names.
// Admins only.

import { ImageResponse } from 'next/og'

import { requireAdmin } from '@/admin/guard'
import { loadImageAssets } from '@/share/assets'
import { IMAGE_WIDTH, picksImage } from '@/share/images'
import { loadShareData, weekParam } from '@/share/load'
import { picksImageModel } from '@/share/models'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
    await requireAdmin()
    const { id } = await params
    const { data, settings } = await loadShareData(id)
    const week = weekParam(new URL(request.url).searchParams.get('week'), data.currentWeek ?? 1, data.rows.weeks.length)

    const model = picksImageModel(data.context, settings, week)
    const crestPaths = model.teams.flatMap((team) => {
        return team.crestUrl === null ? [] : [team.crestUrl]
    })
    const image = picksImage(model, await loadImageAssets(crestPaths))

    return new ImageResponse(image.element, {
        width: IMAGE_WIDTH,
        height: image.height,
        headers: { 'cache-control': 'private, no-store' },
    })
}
