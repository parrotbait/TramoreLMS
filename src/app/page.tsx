// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Placeholder home page. The real home page comes in build step 9.

import Image from 'next/image'
import Link from 'next/link'

import { isPreviewEnabled } from '@/preview/store'
import { brand } from '@/theme/tokens'

export default function HomePage() {
    return (
        <main>
            <header className="bg-maroon px-4 py-6 text-center text-on-maroon">
                <Image src={brand.logoPath} alt={`${brand.clubName} crest`} width={96} height={98} priority className="mx-auto" />
                <h1 className="mt-3 text-2xl font-bold">Last Man Standing</h1>
                <p>{brand.fundraisingLine}</p>
            </header>
            <section className="space-y-4 px-4 py-6 text-center">
                <p className="inline-block rounded-full bg-gold px-4 py-2 font-semibold text-on-gold">Entries open soon</p>
                {isPreviewEnabled()
                    ? (
                        <p>
                            <Link href="/preview" className="font-semibold text-maroon underline">Open the preview</Link>
                        </p>
                    )
                    : null}
            </section>
        </main>
    )
}
