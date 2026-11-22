// Created by Claude driven by Eddie Long on 2026-11-02.
//
// Shows the result of a Checkout. /enter/complete has already confirmed the
// payment with Stripe and signed this browser in, if it started the Checkout.
// While a payment is still confirming, the page refreshes through
// /enter/complete, so the sign-in happens as soon as it goes through.

import { eq } from 'drizzle-orm'
import Link from 'next/link'

import { currentSession } from '@/auth/session'
import { AuthCard } from '@/components/AuthCard'
import { getDatabase } from '@/db/client'
import { competitions, entries, payments } from '@/db/schema'
import { attemptOf, shouldKeepChecking } from '@/payments/confirming'

export const dynamic = 'force-dynamic'

interface DonePageProps {
    readonly searchParams: Promise<{ readonly session_id?: string; readonly n?: string }>
}

export default async function EnterDonePage({ searchParams }: DonePageProps) {
    const params = await searchParams
    const sessionId = params.session_id ?? ''
    const attempt = attemptOf(params.n)
    const row = await paymentFor(sessionId)

    if (row === undefined) {
        return (
            <AuthCard title="Payment not found">
                <p className="text-sm text-muted">We couldn’t find that payment. If you were charged, contact the organiser.</p>
            </AuthCard>
        )
    }

    if (row.status === 'paid') {
        const isSignedIn = (await currentSession()) !== null
        return (
            <AuthCard title={row.kind === 'buyback' ? 'You’re back in!' : row.isDemo ? 'You’re in the demo!' : 'You’re in!'}>
                <p className="text-sm text-muted">
                    {row.isDemo
                        ? <>Thanks, <strong className="text-ink">{row.displayName}</strong>. Your test payment worked. No real money was taken.</>
                        : <>Thanks, <strong className="text-ink">{row.displayName}</strong>. Your payment worked. It helps Tramore Athletic.</>}
                </p>
                <p className="text-sm text-muted">
                    {isSignedIn
                        ? 'We also emailed you a link. Use it to sign in on your other phone or computer.'
                        : 'We emailed you a link. Use it to sign in and make your first pick.'}
                </p>
                <Link
                    href={isSignedIn ? '/pick' : '/signin?next=/pick'}
                    className="block min-h-12 rounded-xl bg-maroon px-4 py-3 text-center font-bold text-on-maroon"
                >
                    {isSignedIn ? 'Make my pick' : 'Sign in'}
                </Link>
            </AuthCard>
        )
    }

    if (row.status === 'failed') {
        return (
            <AuthCard title="The payment didn’t go through">
                <p className="text-sm text-muted">No money was taken. Sign in to try again. We keep your name for a short time.</p>
                <Link href="/signin" className="block text-sm font-semibold text-maroon underline">Sign in</Link>
            </AuthCard>
        )
    }

    const encoded = encodeURIComponent(sessionId)
    if (!shouldKeepChecking(attempt)) {
        return (
            <AuthCard title="Still confirming your payment">
                <p className="text-sm text-muted">
                    This is taking longer than usual. If you were charged, your payment is safe.
                    We will add you as soon as it comes through.
                </p>
                <Link
                    href={`/enter/complete?session_id=${encoded}`}
                    className="block min-h-12 rounded-xl bg-maroon px-4 py-3 text-center font-bold text-on-maroon"
                >
                    Check again
                </Link>
                <p className="text-xs text-muted">Still nothing after a few minutes? Tell the organiser.</p>
            </AuthCard>
        )
    }

    return (
        <AuthCard title="Confirming your payment…">
            <meta httpEquiv="refresh" content={`3;url=/enter/complete?session_id=${encoded}&n=${attempt + 1}`} />
            <p className="text-sm text-muted">This usually takes a few seconds. The page will update by itself.</p>
        </AuthCard>
    )
}

async function paymentFor(sessionId: string) {
    if (sessionId === '') {
        return undefined
    }

    const [row] = await getDatabase()
        .select({
            status: payments.status,
            kind: payments.kind,
            displayName: entries.displayName,
            isDemo: competitions.isDemo,
        })
        .from(payments)
        .innerJoin(entries, eq(entries.id, payments.entryId))
        .innerJoin(competitions, eq(competitions.id, entries.competitionId))
        .where(eq(payments.stripeSessionId, sessionId))

    return row
}
