// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Loads what the share page and its images need. Server only.

import { loadAdminCompetition } from '@/admin/load'
import { siteUrl } from '@/auth/session'

import type { ShareSettings } from './models'

export async function loadShareData(competitionId: string) {
    const data = await loadAdminCompetition(competitionId)
    const settings: ShareSettings = {
        competitionName: data.rows.competition.name,
        siteUrl: siteUrl(),
        prizeCents: data.rows.competition.prizeCents,
        buybackFeeCents: data.rows.competition.buybackFeeCents,
    }

    return { data, settings }
}

/** A week number from the address, within the weeks that exist, or the fallback. */
export function weekParam(value: string | null | undefined, fallback: number, highest: number): number {
    const number = Number(value)
    return Number.isInteger(number) && number >= 1 && number <= highest ? number : fallback
}
