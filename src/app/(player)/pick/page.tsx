// Created by Claude driven by Eddie Long on 2026-11-03.

import Link from 'next/link'

import { PickScreen } from '@/components/PickScreen'
import { formatEuro } from '@/lib/format'
import { buyBackForEntryAction, pickTeamAction } from '@/player/actions'
import { loadPlayerPage } from '@/player/load'
import { buildPickScreen, pickScreenWeeks } from '@/view-models/pick-screen'
import type { WeekTab } from '@/view-models/pick-screen'

interface PickPageProps {
    readonly searchParams: Promise<{ readonly week?: string }>
}

export default async function PickPage({ searchParams }: PickPageProps) {
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

    const { week } = await searchParams
    const requested = Number(week)
    const { weekNumber, tabs } = pickScreenWeeks(
        page.context,
        page.entry.entryId,
        page.currentWeek,
        Number.isInteger(requested) ? requested : null,
    )
    const model = buildPickScreen(page.context, page.entry.entryId, weekNumber)

    return (
        <div className="mx-auto max-w-md space-y-4">
            <WeekTabs tabs={tabs} selectedWeek={weekNumber} latestWeek={page.currentWeek} />
            <PickScreen
                model={model}
                pickAction={pickTeamAction.bind(null, page.entry.entryId, weekNumber)}
                buybackAction={buyBackForEntryAction.bind(null, page.entry.entryId)}
                buybackFeeLabel={formatEuro(page.buybackFeeCents)}
            />
        </div>
    )
}

/** Back to last week’s locked pick, or on to this week to pick ahead. Plain links, so the address says which week. */
function WeekTabs({ tabs, selectedWeek, latestWeek }: {
    readonly tabs: readonly WeekTab[]
    readonly selectedWeek: number
    readonly latestWeek: number
}) {
    if (tabs.length === 0) {
        return null
    }

    return (
        <nav aria-label="Week" className="flex gap-1 rounded-xl bg-subtle p-1">
            {tabs.map((tab) => {
                const isSelected = tab.weekNumber === selectedWeek
                const href = tab.weekNumber === latestWeek ? '/pick' : `/pick?week=${tab.weekNumber}`
                return (
                    <Link
                        key={tab.weekNumber}
                        href={href}
                        replace
                        aria-current={isSelected ? 'page' : undefined}
                        className={`min-h-10 flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold ${
                            isSelected ? 'bg-surface text-ink shadow-sm' : 'text-muted'
                        }`}
                    >
                        {tab.label}
                    </Link>
                )
            })}
        </nav>
    )
}
