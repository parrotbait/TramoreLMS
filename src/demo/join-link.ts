// Created by Claude driven by Eddie Long on 2026-11-18.
//
// Is a demo invite link good to use right now? It needs a running demo, the
// right code for that demo, a site secret to check it with, and Stripe in
// test mode. Used by the join page and the join action, so both agree.

import type { Database } from '@/db/client'
import { isStripeTestMode } from '@/payments/stripe'

import { isJoinCodeValid, joinSecret } from './join-code'
import { findDemo } from './service'
import type { DemoRow } from './service'

/** The demo the link is for, or `null` if the link should not work. */
export async function isDemoLinkUsable(db: Database, code: string): Promise<DemoRow | null> {
    const demo = await findDemo(db)
    const secret = joinSecret()
    if (demo === null || secret === null || !isStripeTestMode(process.env['STRIPE_SECRET_KEY'])) {
        return null
    }

    return isJoinCodeValid(code, demo.id, secret) ? demo : null
}
