// Created by Claude driven by Eddie Long on 2026-11-02.
//
// Turns a verified Stripe event into what we need to do. Pure. Only the
// Checkout events matter. Everything else is acknowledged and ignored.

import type Stripe from 'stripe'

import type { PaymentKind } from './activation'

export type WebhookCommand =
    | {
        readonly kind: 'paid'
        readonly sessionId: string
        readonly entryId: string
        readonly paymentKind: PaymentKind
        readonly amountCents: number
        readonly paymentIntentId: string | null
    }
    | { readonly kind: 'failed'; readonly sessionId: string }
    | { readonly kind: 'ignore' }

export function commandFromEvent(event: Stripe.Event): WebhookCommand {
    switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded':
            return commandFromSession(event.data.object)
        case 'checkout.session.expired':
        case 'checkout.session.async_payment_failed':
            return { kind: 'failed', sessionId: event.data.object.id }
        default:
            return { kind: 'ignore' }
    }
}

/**
 * Also used when the player lands back on the site: the server fetches the
 * session from Stripe, so a late or missing webhook never leaves them stuck.
 */
export function commandFromSession(session: Stripe.Checkout.Session): WebhookCommand {
    // A delayed payment method completes the session before the money arrives.
    // async_payment_succeeded follows when it does.
    if (session.payment_status !== 'paid') {
        return { kind: 'ignore' }
    }

    const entryId = session.metadata?.['entryId'] ?? session.client_reference_id
    const paymentKind = session.metadata?.['kind']
    if (entryId === undefined || entryId === null || (paymentKind !== 'entry' && paymentKind !== 'buyback')) {
        return { kind: 'ignore' }
    }

    const intent = session.payment_intent
    return {
        kind: 'paid',
        sessionId: session.id,
        entryId,
        paymentKind,
        amountCents: session.amount_total ?? 0,
        paymentIntentId: intent === null ? null : typeof intent === 'string' ? intent : intent.id,
    }
}
