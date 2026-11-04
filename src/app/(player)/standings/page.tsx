// Created by Claude driven by Eddie Long on 2026-11-03.

import { StandingsView } from '@/components/StandingsView'
import { loadPlayerPage } from '@/player/load'
import { buildProgression } from '@/view-models/progression'
import { buildStandings } from '@/view-models/standings'

export default async function StandingsPage() {
    const page = await loadPlayerPage()
    if (page.kind !== 'ready') {
        return null
    }

    return (
        <StandingsView
            model={buildStandings(page.context, page.prizeCents)}
            progression={buildProgression(page.context)}
            highlightEntryId={page.entry.entryId}
        />
    )
}
