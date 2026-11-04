// Created by Claude driven by Eddie Long on 2026-10-31.

import type { Metadata, Viewport } from 'next'
import type { CSSProperties, ReactNode } from 'react'

import { brand, colours, themeVariables } from '@/theme/tokens'

import './globals.css'

export const metadata: Metadata = {
    title: `Last Man Standing · ${brand.clubName}`,
    description: `${brand.fundraisingLine}. Pick one Premier League team each week. Last one standing wins.`,
    icons: { apple: '/apple-touch-icon.png' },
}

export const viewport: Viewport = {
    themeColor: colours.maroon,
}

export default function RootLayout({ children }: { readonly children: ReactNode }) {
    return (
        // Browser extensions often add classes to <html> and <body> before React
        // starts. suppressHydrationWarning ignores that on these two elements only.
        <html lang="en-IE" style={themeVariables as CSSProperties} suppressHydrationWarning>
            <body className="min-h-dvh antialiased" suppressHydrationWarning>
                {children}
            </body>
        </html>
    )
}
