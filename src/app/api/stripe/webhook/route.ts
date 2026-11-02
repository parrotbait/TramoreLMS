// Created by Claude driven by Eddie Long on 2026-11-02.
//
// Stripe calls this after Checkout. The signature is checked first, so
// nobody can mark an entry paid by calling the address themselves. Stripe
// retries anything that is not a 2xx, and every step is safe to repeat.
//
// Events to send, in the Stripe dashboard and with `stripe listen --events`:
//   checkout.session.completed
//   checkout.session.async_payment_succeeded
//   checkout.session.async_payment_failed
//   checkout.session.expired

import { getDatabase } from '@/db/client'
import { mailerFromEnv } from '@/email/mailer'
import { confirmPayment, failCheckout } from '@/payments/service'
import { gatewayFromEnv, verifyWebhook } from '@/payments/stripe'
import { commandFromEvent } from '@/payments/webhook-events'
import { siteUrl } from '@/auth/session'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
    const secret = process.env['STRIPE_WEBHOOK_SECRET'] ?? ''
    const signature = request.headers.get('stripe-signature') ?? ''
    if (secret === '' || signature === '') {
        return new Response('Missing signature', { status: 400 })
    }

    const rawBody = await request.text()
    let event
    try {
        event = verifyWebhook(rawBody, signature, secret)
    } catch {
        return new Response('Bad signature', { status: 400 })
    }

    const command = commandFromEvent(event)
    switch (command.kind) {
        case 'ignore':
            break
        case 'failed':
            await failCheckout(getDatabase(), command.sessionId)
            break
        case 'paid':
            await confirmPayment({
                db: getDatabase(),
                gateway: gatewayFromEnv(),
                mailer: mailerFromEnv(),
                now: new Date(),
                siteUrl: siteUrl(),
            }, command)
            break
    }

    return Response.json({ received: true })
}
