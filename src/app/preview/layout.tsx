// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Clickable preview of the player screens, driven by the simulator.
// Development only, unless ENABLE_PREVIEW=true.

import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { SiteHeader } from '@/components/SiteHeader'
import { isPreviewEnabled } from '@/preview/store'

import { PreviewBar } from './PreviewBar'

export const dynamic = 'force-dynamic'

const LINKS = [
    { href: '/preview', label: 'Home' },
    { href: '/preview/pick', label: 'Pick' },
    { href: '/preview/picks', label: 'Picks' },
    { href: '/preview/standings', label: 'Standings' },
] as const

export default function PreviewLayout({ children }: { readonly children: ReactNode }) {
    if (!isPreviewEnabled()) {
        notFound()
    }

    return (
        <>
            <SiteHeader homeHref="/preview" links={LINKS} />
            <PreviewBar />
            <main className="mx-auto max-w-5xl px-4 py-4 pb-28">{children}</main>
        </>
    )
}
