// Created by Claude driven by Eddie Long on 2026-11-04.
//
// The public pages that sit under the site header: Rules and Privacy
// (Decision 19). The home page has its own larger header.

import Link from 'next/link'
import type { ReactNode } from 'react'

import { SiteHeader } from '@/components/SiteHeader'

const LINKS = [
    { href: '/', label: 'Home' },
    { href: '/rules', label: 'Rules' },
    { href: '/privacy', label: 'Privacy' },
] as const

export default function PublicLayout({ children }: { readonly children: ReactNode }) {
    return (
        <>
            <SiteHeader homeHref="/" links={LINKS} />
            <main className="mx-auto max-w-md space-y-6 px-4 py-6 pb-16">
                {children}
                <footer className="pt-4 text-center text-sm">
                    <Link href="/enter" className="font-semibold text-maroon underline">Enter</Link>
                    {' · '}
                    <Link href="/signin" className="font-semibold text-maroon underline">Sign in</Link>
                </footer>
            </main>
        </>
    )
}
