// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Stripe sends the player here after paying.
//   1. Ask Stripe whether the session is paid, and confirm it if so, without
//      waiting for the webhook.
//   2. If this browser started the Checkout (it has the matching checkout
//      cookie), sign it in. The cookie works once.
//   3. Show the result on /enter/done.
//
// A session id on its own never signs anyone in: it ends up in browser
// history and screenshots.

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { sessionExpiresAt } from '@/auth/rules'
import { setSessionCookie, siteUrl } from '@/auth/session'
import { createSession } from '@/auth/store'
import { getDatabase } from '@/db/client'
import { mailerFromEnv } from '@/email/mailer'
import { CHECKOUT_COOKIE } from '@/payments/checkout-cookie'
import { claimCheckoutSignIn, reconcileCheckout } from '@/payments/service'
import { gatewayFromEnv } from '@/payments/stripe'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<never> {
    const sessionId = new URL(request.url).searchParams.get('session_id') ?? ''
    const done = `/enter/done?session_id=${encodeURIComponent(sessionId)}`
    if (sessionId === '') {
        redirect(done)
    }

    const db = getDatabase()
    const now = new Date()
    try {
        const environment = { db, gateway: gatewayFromEnv(), mailer: mailerFromEnv(), now, siteUrl: siteUrl() }
        await reconcileCheckout(environment, sessionId)
    } catch (error) {
        console.warn(`Could not check Checkout session ${sessionId} with Stripe:`, error)
    }

    const jar = await cookies()
    const checkoutToken = jar.get(CHECKOUT_COOKIE)?.value
    if (checkoutToken !== undefined && checkoutToken !== '') {
        const personId = await claimCheckoutSignIn(db, sessionId, checkoutToken, now)
        if (personId !== null) {
            const expiresAt = sessionExpiresAt(false, now)
            await setSessionCookie(await createSession(db, personId, false, expiresAt, now), expiresAt)
            jar.delete({ name: CHECKOUT_COOKIE, path: '/enter' })
        }
    }

    redirect(done)
}
