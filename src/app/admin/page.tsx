// Created by Claude driven by Eddie Long on 2026-11-01.
//
// Placeholder admin home. The admin area itself comes in build step 10.

import { redirect } from 'next/navigation'

import { signOutAction } from '@/auth/actions'
import { currentSession } from '@/auth/session'
import { AuthCard } from '@/components/AuthCard'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
    const session = await currentSession()
    if (session === null || !session.isAdmin) {
        redirect('/admin/signin')
    }

    return (
        <AuthCard title="Admin">
            <p className="text-sm text-muted">Signed in as <strong className="text-ink">{session.email}</strong>.</p>
            <p className="text-sm text-muted">The admin area arrives in build step 10.</p>
            <form action={signOutAction}>
                <button type="submit" className="min-h-11 w-full rounded-xl border border-line font-semibold">Sign out</button>
            </form>
        </AuthCard>
    )
}
