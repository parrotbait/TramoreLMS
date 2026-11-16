// Created by Claude driven by Eddie Long on 2026-11-16.
//
// A link that shows it was pressed. While the next page loads it pulses and
// dims, and the pointer shows “busy”. Use it for every link in a navigation
// bar or tab row, because pages can take a moment to load and a link that
// does nothing visible looks broken (see CLAUDE.md, “Button feedback”).
//
// It also covers links to the same page with another ?week=, which never
// show a loading screen. With “reduce motion” on, the dimming still shows.

'use client'

import Link, { useLinkStatus } from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

export function PendingLink({ children, className = '', ...props }: ComponentProps<typeof Link>) {
    return (
        <Link {...props} className={className}>
            <LinkLabel>{children}</LinkLabel>
        </Link>
    )
}

function LinkLabel({ children }: { readonly children: ReactNode }) {
    const { pending } = useLinkStatus()

    return (
        <span
            aria-busy={pending}
            className={pending ? 'cursor-progress animate-pulse opacity-60 motion-reduce:animate-none' : ''}
        >
            {children}
        </span>
    )
}
