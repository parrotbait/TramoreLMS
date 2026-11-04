// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Shows the notice or error an admin action came back with.

'use client'

import { useSearchParams } from 'next/navigation'

export function AdminNotice() {
    const params = useSearchParams()
    const error = params.get('error')
    const notice = params.get('notice')

    if (error !== null) {
        return <p role="alert" className="rounded-xl border-2 border-maroon bg-subtle px-3 py-2 text-sm font-semibold">{error}</p>
    }

    if (notice !== null) {
        return <p role="status" className="rounded-xl border-2 border-gold bg-subtle px-3 py-2 text-sm">{notice}</p>
    }

    return null
}
