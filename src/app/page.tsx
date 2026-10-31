// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Placeholder home page. The real home page comes in build step 9.

import Image from 'next/image'

import { brand } from '@/theme/tokens'

export default function HomePage() {
    return (
        <main>
            <header
                style={{
                    background: 'var(--colour-maroon)',
                    color: 'var(--colour-on-maroon)',
                    padding: '1.5rem 1rem',
                    textAlign: 'center',
                }}
            >
                <Image src={brand.logoPath} alt={`${brand.clubName} crest`} width={96} height={98} priority />
                <h1 style={{ margin: '0.75rem 0 0.25rem' }}>Last Man Standing</h1>
                <p style={{ margin: 0 }}>{brand.fundraisingLine}</p>
            </header>
            <section style={{ padding: '1.5rem 1rem', textAlign: 'center' }}>
                <p
                    style={{
                        display: 'inline-block',
                        background: 'var(--colour-gold)',
                        color: 'var(--colour-on-gold)',
                        padding: '0.5rem 1rem',
                        borderRadius: '999px',
                        fontWeight: 600,
                    }}
                >
                    Entries open soon
                </p>
            </section>
        </main>
    )
}
