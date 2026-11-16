// Created by Claude driven by Eddie Long on 2026-11-16.
//
// Shown at once while a player page loads. The header and tabs stay put.

import { Spinner } from '@/components/Spinner'

export default function Loading() {
    return (
        <div role="status" className="mx-auto flex max-w-md items-center justify-center gap-2 py-16 text-sm text-muted">
            <Spinner className="h-5 w-5" />
            <span>Loading…</span>
        </div>
    )
}
