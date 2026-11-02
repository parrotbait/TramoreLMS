// Created by Claude driven by Eddie Long on 2026-11-02.

import Link from 'next/link'

import { AuthCard } from '@/components/AuthCard'

export default function EnterCancelledPage() {
    return (
        <AuthCard title="Payment cancelled">
            <p className="text-sm text-muted">
                No money was taken. Your name is held for an hour from when you started, so you can still finish.
            </p>
            <Link href="/enter" className="block min-h-12 rounded-xl bg-maroon px-4 py-3 text-center font-bold text-on-maroon">
                Try again
            </Link>
        </AuthCard>
    )
}
