// Created by Claude driven by Eddie Long on 2026-11-18.
//
// Where a demo invite link lands. It looks and works like the real entry page
// (/enter), so people see the real sign-up. The payment is a Stripe test
// payment, and they land in the demo, not the real competition.

import type { Metadata } from 'next'
import Link from 'next/link'

import { AuthCard } from '@/components/AuthCard'
import { EntryForm } from '@/components/EntryForm'
import { getDatabase } from '@/db/client'
import { joinDemoAction } from '@/demo/join-actions'
import { isDemoLinkUsable } from '@/demo/join-link'
import { formatEuro } from '@/lib/format'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { robots: { index: false, follow: false } }

interface JoinDemoPageProps {
    readonly searchParams: Promise<{ readonly code?: string }>
}

export default async function JoinDemoPage({ searchParams }: JoinDemoPageProps) {
    const code = (await searchParams).code ?? ''
    const demo = await isDemoLinkUsable(getDatabase(), code)

    if (demo === null) {
        return (
            <AuthCard title="This demo link isn’t working">
                <p className="text-sm text-muted">
                    The demo may have ended, or the link is old. Ask the organiser for a new link.
                </p>
                <Link href="/signin" className="block text-sm font-semibold text-maroon underline">Already joined? Sign in</Link>
            </AuthCard>
        )
    }

    return (
        <AuthCard title="Join the demo">
            <p className="text-sm text-muted">
                This is a pretend game, so you pay with a test card. No real money is taken.
                There is no password. We email you a link to sign in.
            </p>
            <p className="rounded-xl bg-subtle px-3 py-2 text-sm">
                Test card: <strong>4242 4242 4242 4242</strong>. Use any date in the future and any 3 numbers.
                The price shows as {formatEuro(demo.entryFeeCents)}.
            </p>
            <EntryForm
                action={joinDemoAction.bind(null, code)}
                submitLabel="Continue to the test payment"
                pendingLabel="Opening payment…"
                problemText={{ closed: 'The demo is full, or it has ended. Ask the organiser for a new link.' }}
            />
            <p className="text-xs text-muted">
                By joining you agree to the <Link href="/rules" className="underline">rules</Link> and the{' '}
                <Link href="/privacy" className="underline">privacy notice</Link>.
            </p>
        </AuthCard>
    )
}
