// Created by Claude driven by Eddie Long on 2026-10-31.

'use server'

import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'

import type { PickActionResult } from '@/components/PickScreen'
import {
    advancePreview,
    buyBackForYou,
    getPreview,
    isPreviewEnabled,
    pickForYou,
    playToEnd,
    postponeAMatch,
    resetPreview,
} from '@/preview/store'
import { pickRejectionMessage } from '@/view-models/messages'

async function previewSession() {
    if (!isPreviewEnabled()) {
        notFound()
    }

    return getPreview()
}

function refresh() {
    revalidatePath('/preview', 'layout')
}

export async function previewPick(teamId: string): Promise<PickActionResult> {
    const session = await previewSession()
    const validation = pickForYou(session, teamId)
    refresh()

    if (!validation.ok) {
        return { ok: false, message: pickRejectionMessage(validation.reason) }
    }

    return { ok: true, teamName: session.competition.teamName(teamId) }
}

export async function previewAdvance() {
    await advancePreview(await previewSession())
    refresh()
}

export async function previewPlayToEnd() {
    await playToEnd(await previewSession())
    refresh()
}

export async function previewPostpone() {
    postponeAMatch(await previewSession())
    refresh()
}

export async function previewBuyBack() {
    buyBackForYou(await previewSession())
    refresh()
}

export async function previewReset() {
    if (!isPreviewEnabled()) {
        notFound()
    }

    await resetPreview()
    refresh()
}
