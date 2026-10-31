// Created by Claude driven by Eddie Long on 2026-10-31.

import { StandingsView } from '@/components/StandingsView'
import { getPreview, viewContextOf } from '@/preview/store'
import { buildStandings } from '@/view-models/standings'

const PRIZE_CENTS = 30_000

export default async function PreviewStandingsPage() {
    const session = await getPreview()

    return <StandingsView model={buildStandings(viewContextOf(session), PRIZE_CENTS)} />
}
