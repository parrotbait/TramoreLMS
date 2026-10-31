// Created by Claude driven by Eddie Long on 2026-10-31.

import type { Metadata, Viewport } from 'next'
import type { CSSProperties, ReactNode } from 'react'

import { brand, colours, themeVariables } from '@/theme/tokens'

import './globals.css'

export const metadata: Metadata = {
    title: `Last Man Standing · ${brand.clubName}`,
    description: `${brand.fundraisingLine}. Pick one Premier League team each week. Last one standing wins.`,
}

export const viewport: Viewport = {
    themeColor: colours.maroon,
}

export default function RootLayout({ children }: { readonly children: ReactNode }) {
    return (
        <html lang="en-IE" style={themeVariables as CSSProperties}>
            <body className="min-h-dvh antialiased">
                {children}
            </body>
        </html>
    )
}
