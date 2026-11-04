// Created by Claude driven by Eddie Long on 2026-11-03.

import { PicksReveal } from '@/components/PicksReveal'
import { loadPlayerPage } from '@/player/load'
import { buildPicksReveal } from '@/view-models/picks-reveal'

interface PicksPageProps {
    readonly searchParams: Promise<{ readonly week?: string }>
}

export default async function PicksPage({ searchParams }: PicksPageProps) {
    const page = await loadPlayerPage()
    if (page.kind !== 'ready') {
        return null
    }

    if (page.currentWeek === null) {
        return (
            <section className="mx-auto max-w-md rounded-2xl border-2 border-line bg-surface px-4 py-4">
                <h2 className="font-bold">No picks yet</h2>
                <p className="mt-1 text-sm text-muted">Everyone’s picks appear here after each cut-off.</p>
            </section>
        )
    }

    const requested = Number((await searchParams).week)
    const weekNumber = Number.isInteger(requested) && requested >= 1 && requested <= page.currentWeek
        ? requested
        : page.currentWeek
    const weekLinks = Array.from({ length: page.currentWeek }, (_, index) => {
        return { weekNumber: index + 1, href: `/picks?week=${index + 1}` }
    })

    return (
        <div className="mx-auto max-w-md">
            <PicksReveal model={buildPicksReveal(page.context, weekNumber)} weekLinks={weekLinks} />
        </div>
    )
}
