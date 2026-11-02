// Created by Claude driven by Eddie Long on 2026-11-02.
//
// Runs the pending-Checkout safety net, if Stripe is set up. Called before
// the tick, so a payment confirmed here is locked and auto-assigned in the
// same run.

import { siteUrl } from '@/auth/session'
import type { Database } from '@/db/client'
import { mailerFromEnv } from '@/email/mailer'
import { reconcilePendingCheckouts } from '@/payments/service'
import type { ReconcileReport } from '@/payments/service'
import { stripeGateway } from '@/payments/stripe'

export async function reconcilePayments(db: Database, now: Date): Promise<ReconcileReport | null> {
    const key = process.env['STRIPE_SECRET_KEY'] ?? ''
    if (key === '') {
        return null
    }

    return reconcilePendingCheckouts({
        db,
        gateway: stripeGateway(key),
        mailer: mailerFromEnv(),
        now,
        siteUrl: siteUrl(),
    })
}
