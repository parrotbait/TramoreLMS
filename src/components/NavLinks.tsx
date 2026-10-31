// Created by Claude driven by Eddie Long on 2026-10-31.

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export interface NavLink {
    readonly href: string
    readonly label: string
}

export function NavLinks({ links }: { readonly links: readonly NavLink[] }) {
    const pathname = usePathname()

    return (
        <nav className="mx-auto flex max-w-md gap-1 px-2 pb-2">
            {links.map((link) => {
                const isActive = pathname === link.href
                return (
                    <Link
                        key={link.href}
                        href={link.href}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex-1 rounded-lg px-2 py-2 text-center text-sm font-semibold ${
                            isActive ? 'bg-gold text-on-gold' : 'text-on-maroon hover:bg-on-maroon/10'
                        }`}
                    >
                        {link.label}
                    </Link>
                )
            })}
        </nav>
    )
}
