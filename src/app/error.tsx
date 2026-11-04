// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Shown when a page fails. Never shows the error itself: technical details
// go to the server log, and the player gets a plain message and a way out.

'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import { AuthCard } from '@/components/AuthCard'

interface ErrorPageProps {
    readonly error: Error & { digest?: string }
    readonly reset: () => void
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
    useEffect(() => {
        console.error(error)
    }, [error])

    return (
        <AuthCard title="Something went wrong">
            <p className="text-sm text-muted">Sorry, that didn’t work. Please try again in a moment.</p>
            {error.digest === undefined ? null : <p className="text-xs text-muted">Reference: {error.digest}</p>}
            <button
                type="button"
                onClick={() => {
                    reset()
                }}
                className="min-h-12 w-full rounded-xl bg-maroon font-bold text-on-maroon"
            >
                Try again
            </button>
            <Link href="/" className="block text-center text-sm font-semibold text-maroon underline">Go to the home page</Link>
        </AuthCard>
    )
}
