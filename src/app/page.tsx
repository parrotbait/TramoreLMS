// Created by Claude driven by Eddie Long on 2026-10-31.
//
// The public home page: what this is, and the way in. The fuller home page,
// with the rules and prize details, comes with the rules page.

import Image from 'next/image'
import Link from 'next/link'

import { getDatabase } from '@/db/client'
import { formatEuro } from '@/lib/format'
import { openCompetitionForEntries } from '@/payments/service'
import { isPreviewEnabled } from '@/preview/enabled'
import { brand } from '@/theme/tokens'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
    const competition = await openCompetitionForEntries(getDatabase(), new Date()).catch(() => {
        return null
    })

    return (
        <main>
            <header className="bg-maroon px-4 py-6 text-center text-on-maroon">
                <Image src={brand.logoPath} alt={`${brand.clubName} crest`} width={96} height={98} priority className="mx-auto" />
                <h1 className="mt-3 text-2xl font-bold">Last Man Standing</h1>
                <p>{brand.fundraisingLine}</p>
            </header>
            <section className="mx-auto max-w-md space-y-4 px-4 py-6 text-center">
                <p className="text-sm text-muted">
                    Pick one Premier League team each week. Win and you’re through. Draw or lose and you’re out.
                    Each team once. Last one standing wins.
                </p>
                {competition === null
                    ? <p className="inline-block rounded-full bg-gold px-4 py-2 font-semibold text-on-gold">Entries open soon</p>
                    : (
                        <Link href="/enter" className="block min-h-12 rounded-2xl bg-maroon px-4 py-3 text-lg font-bold text-on-maroon">
                            Enter for {formatEuro(competition.entryFeeCents)}
                        </Link>
                    )}
                <p className="text-sm">
                    Already entered? <Link href="/signin" className="font-semibold text-maroon underline">Sign in</Link>
                </p>
                {isPreviewEnabled()
                    ? (
                        <p className="text-sm">
                            <Link href="/preview" className="font-semibold text-maroon underline">Open the preview</Link>
                        </p>
                    )
                    : null}
            </section>
        </main>
    )
}
