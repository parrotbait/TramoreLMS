// Created by Claude driven by Eddie Long on 2026-11-04.

import Link from 'next/link'

import { AuthCard } from '@/components/AuthCard'

export default function NotFound() {
    return (
        <AuthCard title="Page not found">
            <p className="text-sm text-muted">That page doesn’t exist, or the link has changed.</p>
            <Link href="/" className="block min-h-12 rounded-xl bg-maroon px-4 py-3 text-center font-bold text-on-maroon">
                Go to the home page
            </Link>
        </AuthCard>
    )
}
