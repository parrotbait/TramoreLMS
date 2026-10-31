// Created by Claude driven by Eddie Long on 2026-10-31.

import Image from 'next/image'
import Link from 'next/link'

import { brand } from '@/theme/tokens'

import { NavLinks } from './NavLinks'
import type { NavLink } from './NavLinks'

interface SiteHeaderProps {
    readonly homeHref: string
    readonly links: readonly NavLink[]
}

export function SiteHeader({ homeHref, links }: SiteHeaderProps) {
    return (
        <header className="bg-maroon text-on-maroon">
            <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
                <Link href={homeHref} className="flex items-center gap-3">
                    <Image src={brand.logoPath} alt={`${brand.clubName} crest`} width={44} height={45} priority />
                    <span>
                        <span className="block text-lg font-bold leading-tight">Last Man Standing</span>
                        <span className="block text-xs opacity-90">{brand.fundraisingLine}</span>
                    </span>
                </Link>
            </div>
            <NavLinks links={links} />
        </header>
    )
}
