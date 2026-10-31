// Created by Claude driven by Eddie Long on 2026-10-31.

import type { Metadata } from 'next'
import type { CSSProperties, ReactNode } from 'react'

import { brand, colours } from '@/theme/tokens'

export const metadata: Metadata = {
    title: `Last Man Standing · ${brand.clubName}`,
    description: `${brand.fundraisingLine}. Pick one Premier League team each week. Last one standing wins.`,
}

const themeVariables = {
    '--colour-maroon': colours.maroon,
    '--colour-gold': colours.gold,
    '--colour-on-maroon': colours.onMaroon,
    '--colour-on-gold': colours.onGold,
    '--colour-surface': colours.surface,
    '--colour-text': colours.text,
    '--colour-muted': colours.muted,
} as CSSProperties

export default function RootLayout({ children }: { readonly children: ReactNode }) {
    return (
        <html lang="en-IE" style={themeVariables}>
            <body
                style={{
                    margin: 0,
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    background: 'var(--colour-surface)',
                    color: 'var(--colour-text)',
                }}
            >
                {children}
            </body>
        </html>
    )
}
