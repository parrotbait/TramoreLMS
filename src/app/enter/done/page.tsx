// Created by Claude driven by Eddie Long on 2026-11-02.
//
// Stripe sends the player here after paying. If the payment is not recorded
// yet, the server asks Stripe directly and confirms it, so the player never
// waits on the webhook. If Stripe cannot be reached, the page checks again
// every few seconds.

import { eq } from 'drizzle-orm'
import Link from 'next/link'

import { siteUrl } from '@/auth/session'
import { AuthCard } from '@/components/AuthCard'
import { getDatabase } from '@/db/client'
import { entries, payments } from '@/db/schema'
import { mailerFromEnv } from '@/email/mailer'
import { reconcileCheckout } from '@/payments/service'
import { gatewayFromEnv } from '@/payments/stripe'

export const dynamic = 'force-dynamic'

interface DonePageProps {
    readonly searchParams: Promise<{ readonly session_id?: string }>
}

export default async function EnterDonePage({ searchParams }: DonePageProps) {
    const sessionId = (await searchParams).session_id ?? ''
    let row = await paymentFor(sessionId)

    if (row?.status === 'pending') {
        try {
            await reconcileCheckout({
                db: getDatabase(),
                gateway: gatewayFromEnv(),
                mailer: mailerFromEnv(),
                now: new Date(),
                siteUrl: siteUrl(),
            }, sessionId)
            row = await paymentFor(sessionId)
        } catch (error) {
            console.warn(`Could not check Checkout session ${sessionId} with Stripe:`, error)
        }
    }

    if (row === undefined) {
        return (
            <AuthCard title="Payment not found">
                <p className="text-sm text-muted">We couldn’t find that payment. If you were charged, contact the organiser.</p>
            </AuthCard>
        )
    }

    if (row.status === 'paid') {
        return (
            <AuthCard title={row.kind === 'buyback' ? 'You’re back in!' : 'You’re in!'}>
                <p className="text-sm text-muted">
                    Thanks, <strong className="text-ink">{row.displayName}</strong>. Your payment is through, and it helps Tramore Athletic.
                </p>
                <p className="text-sm text-muted">
                    {row.kind === 'buyback'
                        ? 'Make your Week 2 pick before the cut-off.'
                        : 'We’ve emailed you a link to sign in and make your first pick.'}
                </p>
                <Link href="/pick" className="block min-h-12 rounded-xl bg-maroon px-4 py-3 text-center font-bold text-on-maroon">
                    Go to my pick
                </Link>
            </AuthCard>
        )
    }

    if (row.status === 'failed') {
        return (
            <AuthCard title="The payment didn’t go through">
                <p className="text-sm text-muted">No money was taken. Sign in to try paying again while your name is held.</p>
                <Link href="/signin" className="block text-sm font-semibold text-maroon underline">Sign in</Link>
            </AuthCard>
        )
    }

    return (
        <AuthCard title="Confirming your payment…">
            <meta httpEquiv="refresh" content="3" />
            <p className="text-sm text-muted">This usually takes a few seconds. The page will update by itself.</p>
        </AuthCard>
    )
}

async function paymentFor(sessionId: string) {
    if (sessionId === '') {
        return undefined
    }

    const [row] = await getDatabase()
        .select({ status: payments.status, kind: payments.kind, displayName: entries.displayName })
        .from(payments)
        .innerJoin(entries, eq(entries.id, payments.entryId))
        .where(eq(payments.stripeSessionId, sessionId))

    return row
}
