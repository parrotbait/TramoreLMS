// Created by Claude driven by Eddie Long on 2026-10-31.

import Link from 'next/link'

import { WeekBanner } from '@/components/WeekBanner'
import { formatDublin, formatEuro } from '@/lib/format'
import { getPreview, viewContextOf } from '@/preview/store'
import { brand } from '@/theme/tokens'

const ENTRY_CENTS = 1000
const PRIZE_CENTS = 30_000

export default async function PreviewHomePage() {
    const session = await getPreview()
    const context = viewContextOf(session)
    const weekNumber = session.timeline.weekNumber
    const cutoffAt = session.timeline.times.cutoffAt

    return (
        <div className="mx-auto max-w-md space-y-4">
            <section className="rounded-2xl border border-line bg-surface p-4">
                <h2 className="text-xl font-bold">Pick one team. Survive the week.</h2>
                <p className="mt-1 text-sm text-muted">
                    Pick one Premier League team each game week. Win and you’re through. Draw or lose and you’re out.
                    Each team can only be picked once. Last one standing wins.
                </p>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <Stat label="Entry" value={formatEuro(ENTRY_CENTS)} />
                    <Stat label="Prize" value={formatEuro(PRIZE_CENTS)} />
                    <Stat label="Players" value={String(context.standings.entries.size)} />
                </dl>
            </section>

            <WeekBanner
                weekNumber={weekNumber}
                plMatchday={context.plMatchdayOf(weekNumber)}
                cutoffLabel={formatDublin(cutoffAt)}
                cutoffIso={cutoffAt.toISOString()}
                nowIso={session.now.toISOString()}
            />

            <Link
                href="/preview/pick"
                className="block min-h-12 rounded-2xl bg-maroon px-4 py-3 text-center text-lg font-bold text-on-maroon"
            >
                Make your pick
            </Link>

            <p className="text-center text-sm text-muted">
                All money after the prize goes to {brand.clubName}. Thank you for your support.
            </p>
        </div>
    )
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
    return (
        <div className="rounded-xl bg-subtle px-2 py-2">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="text-lg font-bold">{value}</dd>
        </div>
    )
}
