// Created by Claude driven by Eddie Long on 2026-10-31.
//
// The public home page: what this is, the prize, the next cut-off, and the
// way in. “€X raised” shows only when the admin turns it on (Decision 10d).

import Image from 'next/image'
import Link from 'next/link'

import { loadPublicCompetition, loadUpcomingCompetition } from '@/content/load'
import type { PublicCompetition, UpcomingCompetition } from '@/content/load'
import { getDatabase } from '@/db/client'
import { formatDublin, formatEuro } from '@/lib/format'
import { isPreviewEnabled } from '@/preview/enabled'
import { brand } from '@/theme/tokens'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
    const competition = await loadPublicCompetition(getDatabase(), new Date()).catch(() => {
        return null
    })
    const upcoming = competition === null
        ? await loadUpcomingCompetition(getDatabase()).catch(() => {
            return null
        })
        : null

    return (
        <main>
            <header className="bg-maroon px-4 py-6 text-center text-on-maroon">
                <Image src={brand.logoPath} alt={`${brand.clubName} crest`} width={96} height={98} priority className="mx-auto" />
                <h1 className="mt-3 text-2xl font-bold">Last Man Standing</h1>
                <p>{brand.fundraisingLine}</p>
            </header>
            <section className="mx-auto max-w-md space-y-4 px-4 py-6 text-center">
                <div className="space-y-1">
                    <p>Pick one Premier League team each week.</p>
                    <p>If your team wins, you are through. If it draws or loses, you are out.</p>
                    <p>You can use each team once. The last player left wins.</p>
                </div>

                {upcoming === null ? null : <ComingSoon upcoming={upcoming} />}

                {competition === null ? null : <Facts competition={competition} />}

                <EnterButton competition={competition} hasUpcoming={upcoming !== null} />

                <p className="text-sm">
                    Already in? <Link href="/signin" className="font-semibold text-maroon underline">Sign in</Link>
                </p>
                {isPreviewEnabled()
                    ? (
                        <p className="text-sm">
                            <Link href="/preview" className="font-semibold text-maroon underline">Open the preview</Link>
                        </p>
                    )
                    : null}
            </section>
            <footer className="pb-10 text-center text-sm">
                <Link href="/rules" className="font-semibold text-maroon underline">Rules</Link>
                {' · '}
                <Link href="/privacy" className="font-semibold text-maroon underline">Privacy</Link>
            </footer>
        </main>
    )
}

function Facts({ competition }: { readonly competition: PublicCompetition }) {
    const facts = [
        { label: 'Prize', value: formatEuro(competition.prizeCents) },
        { label: 'Entry', value: formatEuro(competition.entryFeeCents) },
        ...(competition.nextCutoff === null
            ? []
            : [{
                label: `Week ${competition.nextCutoff.weekNumber} cut-off`,
                value: formatDublin(competition.nextCutoff.at),
            }]),
        ...(competition.raisedCents === null
            ? []
            : [{ label: 'Raised for the club', value: formatEuro(competition.raisedCents) }]),
    ]

    return (
        <dl className="grid grid-cols-2 gap-2 text-left">
            {facts.map((fact) => {
                return (
                    <div key={fact.label} className="rounded-2xl border border-line bg-subtle px-3 py-2">
                        <dt className="text-xs text-muted">{fact.label}</dt>
                        <dd className="font-bold">{fact.value}</dd>
                    </div>
                )
            })}
        </dl>
    )
}

/** The prize first, then the cost. A player should get both in two seconds. */
function ComingSoon({ upcoming }: { readonly upcoming: UpcomingCompetition }) {
    return (
        <div className="space-y-3 rounded-3xl border-2 border-gold bg-subtle px-4 py-6">
            <p className="inline-block rounded-full bg-gold px-3 py-1 text-sm font-bold uppercase tracking-wide text-on-gold">
                Entries open soon
            </p>
            <div>
                <p className="text-sm text-muted">Win</p>
                <p className="text-6xl font-extrabold leading-none text-maroon">{formatEuro(upcoming.prizeCents)}</p>
            </div>
            <p className="text-xl font-bold">
                It costs just {formatEuro(upcoming.entryFeeCents)} to enter.
            </p>
        </div>
    )
}

interface EnterButtonProps {
    readonly competition: PublicCompetition | null
    readonly hasUpcoming: boolean
}

function EnterButton({ competition, hasUpcoming }: EnterButtonProps) {
    if (competition === null) {
        // The card above already says “Entries open soon”.
        return hasUpcoming
            ? null
            : <p className="inline-block rounded-full bg-gold px-4 py-2 font-semibold text-on-gold">Entries open soon</p>
    }

    if (!competition.isTakingEntries) {
        return <p className="inline-block rounded-full bg-gold px-4 py-2 font-semibold text-on-gold">Entries are closed</p>
    }

    return (
        <Link href="/enter" className="block min-h-12 rounded-2xl bg-maroon px-4 py-3 text-lg font-bold text-on-maroon">
            Enter for {formatEuro(competition.entryFeeCents)}
        </Link>
    )
}
