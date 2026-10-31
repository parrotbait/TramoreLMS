// Created by Claude driven by Eddie Long on 2026-10-31.

import { PicksReveal } from '@/components/PicksReveal'
import { getPreview, viewContextOf } from '@/preview/store'
import { buildPicksReveal } from '@/view-models/picks-reveal'

interface PreviewPicksPageProps {
    readonly searchParams: Promise<{ readonly week?: string }>
}

export default async function PreviewPicksPage({ searchParams }: PreviewPicksPageProps) {
    const session = await getPreview()
    const currentWeek = session.timeline.weekNumber
    const requested = Number((await searchParams).week)
    const weekNumber = Number.isInteger(requested) && requested >= 1 && requested <= currentWeek
        ? requested
        : currentWeek

    const weekLinks = Array.from({ length: currentWeek }, (_, index) => {
        const number = index + 1
        return { weekNumber: number, href: `/preview/picks?week=${number}` }
    })

    return (
        <div className="mx-auto max-w-md">
            <PicksReveal model={buildPicksReveal(viewContextOf(session), weekNumber)} weekLinks={weekLinks} />
        </div>
    )
}
