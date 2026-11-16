// Created by Claude driven by Eddie Long on 2026-11-16.
//
// Shown at once while an admin page loads. The header stays put.

import { Spinner } from '@/components/Spinner'

export default function Loading() {
    return (
        <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
            <Spinner className="h-5 w-5" />
            <span>Loading…</span>
        </div>
    )
}
