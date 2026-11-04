// Created by Claude driven by Eddie Long on 2026-11-03.

import { PickScreen } from '@/components/PickScreen'
import { formatEuro } from '@/lib/format'
import { buyBackForEntryAction, pickTeamAction } from '@/player/actions'
import { loadPlayerPage } from '@/player/load'
import { buildPickScreen } from '@/view-models/pick-screen'

export default async function PickPage() {
    const page = await loadPlayerPage()
    if (page.kind !== 'ready') {
        return null
    }

    if (page.currentWeek === null) {
        return (
            <section className="mx-auto max-w-md rounded-2xl border-2 border-line bg-surface px-4 py-4">
                <h2 className="font-bold">Week 1 isn’t open yet</h2>
                <p className="mt-1 text-sm text-muted">You’re entered and paid. Picks open soon.</p>
            </section>
        )
    }

    const model = buildPickScreen(page.context, page.entry.entryId, page.currentWeek)

    return (
        <div className="mx-auto max-w-md">
            <PickScreen
                model={model}
                pickAction={pickTeamAction.bind(null, page.entry.entryId, page.currentWeek)}
                buybackAction={buyBackForEntryAction.bind(null, page.entry.entryId)}
                buybackFeeLabel={formatEuro(page.buybackFeeCents)}
            />
        </div>
    )
}
