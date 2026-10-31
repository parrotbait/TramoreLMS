// Created by Claude driven by Eddie Long on 2026-10-31.

import { StandingsView } from '@/components/StandingsView'
import { getPreview, viewContextOf, YOU } from '@/preview/store'
import { buildProgression } from '@/view-models/progression'
import { buildStandings } from '@/view-models/standings'

const PRIZE_CENTS = 30_000

export default async function PreviewStandingsPage() {
    const session = await getPreview()
    const context = viewContextOf(session)

    return (
        <StandingsView
            model={buildStandings(context, PRIZE_CENTS)}
            progression={buildProgression(context)}
            highlightEntryId={YOU}
        />
    )
}
