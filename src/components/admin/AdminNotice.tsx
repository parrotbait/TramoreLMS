// Created by Claude driven by Eddie Long on 2026-11-04.
// Changed by Claude driven by Eddie Long on 2026-11-15: a toast, not a banner.
//
// Shows the notice or error an admin action came back with. The action
// redirects with ?notice= or ?error=. This floats at the top of the screen,
// so it is seen wherever the admin has scrolled to. A notice fades after a
// few seconds. An error stays until it is dismissed, so it can't be missed.
// The message is taken out of the address afterwards, so a refresh doesn't
// show it again.

'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

interface Message {
    readonly kind: 'notice' | 'error'
    readonly text: string
}

const NOTICE_MS = 5000

export function AdminNotice() {
    const params = useSearchParams()
    const pathname = usePathname()
    const [message, setMessage] = useState<Message | null>(null)

    const error = params.get('error')
    const notice = params.get('notice')

    useEffect(() => {
        const next: Message | null = error !== null
            ? { kind: 'error', text: error }
            : notice !== null
                ? { kind: 'notice', text: notice }
                : null
        if (next === null) {
            return
        }

        setMessage(next)

        const rest = new URLSearchParams(window.location.search)
        rest.delete('error')
        rest.delete('notice')
        const query = rest.toString()
        window.history.replaceState(null, '', query === '' ? pathname : `${pathname}?${query}`)
    }, [error, notice, pathname])

    useEffect(() => {
        if (message === null || message.kind === 'error') {
            return
        }

        const timer = setTimeout(() => {
            setMessage(null)
        }, NOTICE_MS)
        return () => {
            clearTimeout(timer)
        }
    }, [message])

    if (message === null) {
        return null
    }

    const isError = message.kind === 'error'

    return (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-3">
            <p
                role={isError ? 'alert' : 'status'}
                className={`pointer-events-auto flex max-w-xl items-start gap-3 rounded-xl border-2 bg-surface px-4 py-3 text-sm shadow-lg ${
                    isError ? 'border-maroon font-semibold' : 'border-gold'
                }`}
            >
                <span aria-hidden="true">{isError ? '⚠' : '✓'}</span>
                <span className="flex-1">{message.text}</span>
                <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => {
                        setMessage(null)
                    }}
                    className="-my-1 min-h-8 min-w-8 rounded-lg text-muted"
                >
                    ✕
                </button>
            </p>
        </div>
    )
}
