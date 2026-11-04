// Created by Claude driven by Eddie Long on 2026-11-04.
//
// The weekly status image (PNG) for WhatsApp. Admins only.

import { ImageResponse } from 'next/og'

import { requireAdmin } from '@/admin/guard'
import { loadImageAssets } from '@/share/assets'
import { IMAGE_WIDTH, statusImage } from '@/share/images'
import { loadShareData, weekParam } from '@/share/load'
import { statusImageModel } from '@/share/models'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
    await requireAdmin()
    const { id } = await params
    const { data, settings } = await loadShareData(id)
    const settled = Math.max(1, data.standings.lastSettledWeek)
    const week = weekParam(new URL(request.url).searchParams.get('week'), settled, data.rows.weeks.length)

    const image = statusImage(statusImageModel(data.context, settings, week), await loadImageAssets([]))

    return new ImageResponse(image.element, {
        width: IMAGE_WIDTH,
        height: image.height,
        headers: { 'cache-control': 'private, no-store' },
    })
}
