// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Everything for the WhatsApp group: the reminder text, the status image and
// the picks image (Decisions 11 and 16).

import Link from 'next/link'

import { CompetitionNav } from '@/components/admin/CompetitionNav'
import { CopyText, ImageActions } from '@/components/admin/ShareActions'
import { Card } from '@/components/admin/ui'
import { loadShareData, weekParam } from '@/share/load'
import { reminderText } from '@/share/models'

interface SharePageProps {
    readonly params: Promise<{ readonly id: string }>
    readonly searchParams: Promise<{ readonly week?: string }>
}

export default async function SharePage({ params, searchParams }: SharePageProps) {
    const { id } = await params
    const { data, settings } = await loadShareData(id)
    const { rows, currentWeek, standings } = data
    const highest = rows.weeks.length
    const pickWeek = weekParam((await searchParams).week, currentWeek ?? 1, highest)
    const settledWeek = Math.max(1, standings.lastSettledWeek)
    const base = `/admin/c/${id}/share`
    const stamp = rows.competition.name.replace(/[^\w-]+/g, '-')

    return (
        <>
            <CompetitionNav competitionId={id} name={rows.competition.name} currentWeek={currentWeek} />

            <Card title={`Reminder for Week ${pickWeek}`}>
                <p className="text-sm text-muted">Counts only, no names. Paste it into the WhatsApp group before the cut-off.</p>
                <CopyText text={reminderText(data.context, settings, pickWeek)} />
                <WeekLinks base={base} current={pickWeek} highest={currentWeek ?? 1} />
            </Card>

            <Card title={`Standings after Week ${settledWeek}`}>
                {standings.lastSettledWeek === 0
                    ? <p className="text-sm text-muted">No week has finished yet. This shows the image as it will look.</p>
                    : null}
                <SharePreview src={`${base}/status.png?week=${settledWeek}`} alt={`Standings after Week ${settledWeek}`} />
                <ImageActions src={`${base}/status.png?week=${settledWeek}`} fileName={`${stamp}-week-${settledWeek}-standings.png`} />
            </Card>

            <Card title={`Week ${pickWeek} picks`}>
                <p className="text-sm text-muted">Players per team, no names. Shows nothing until the cut-off.</p>
                <SharePreview src={`${base}/picks.png?week=${pickWeek}`} alt={`Week ${pickWeek} picks`} />
                <ImageActions src={`${base}/picks.png?week=${pickWeek}`} fileName={`${stamp}-week-${pickWeek}-picks.png`} />
            </Card>
        </>
    )
}

/** The images are private and made on each request, so next/image has nothing to optimise. */
function SharePreview({ src, alt }: { readonly src: string; readonly alt: string }) {
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="w-full max-w-md rounded-xl border border-line" />
    )
}

function WeekLinks({ base, current, highest }: {
    readonly base: string
    readonly current: number
    readonly highest: number
}) {
    if (highest <= 1) {
        return null
    }

    return (
        <nav className="flex flex-wrap gap-1 text-sm">
            {Array.from({ length: highest }, (_, index) => {
                const number = index + 1
                return (
                    <Link
                        key={number}
                        href={`${base}?week=${number}`}
                        className={`rounded-lg border px-2 py-1 ${number === current ? 'border-maroon bg-maroon text-on-maroon' : 'border-line bg-surface'}`}
                    >
                        W{number}
                    </Link>
                )
            })}
        </nav>
    )
}
