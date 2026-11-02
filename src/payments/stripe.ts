// Created by Claude driven by Eddie Long on 2026-11-02.
//
// Stripe, behind a small interface so the rest of the code can be tested
// without it. Checkout only: the player pays on Stripe's page.

import Stripe from 'stripe'

import type { PaymentKind } from './activation'

export interface CheckoutRequest {
    readonly entryId: string
    readonly kind: PaymentKind
    readonly amountCents: number
    readonly email: string
    readonly description: string
    readonly successUrl: string
    readonly cancelUrl: string
    /** Stripe allows 30 minutes to 24 hours from now. */
    readonly expiresAt: Date
}

export interface CheckoutSession {
    readonly sessionId: string
    readonly url: string
}

export interface PaymentGateway {
    createCheckout(request: CheckoutRequest): Promise<CheckoutSession>
    /** Asks Stripe for a Checkout session's current state. */
    retrieveCheckout(sessionId: string): Promise<Stripe.Checkout.Session>
    /** Stripe's fee for a completed payment, in cents. 0 if it is not known yet. */
    feeCents(paymentIntentId: string): Promise<number>
    refund(paymentIntentId: string): Promise<void>
}

const MIN_EXPIRY_MS = 31 * 60 * 1000

export function stripeGateway(secretKey: string): PaymentGateway {
    const stripe = new Stripe(secretKey)

    return {
        createCheckout: async (request) => {
            const earliest = Date.now() + MIN_EXPIRY_MS
            const session = await stripe.checkout.sessions.create({
                mode: 'payment',
                currency: 'eur',
                customer_email: request.email,
                client_reference_id: request.entryId,
                metadata: { entryId: request.entryId, kind: request.kind },
                line_items: [{
                    quantity: 1,
                    price_data: {
                        currency: 'eur',
                        unit_amount: request.amountCents,
                        product_data: { name: request.description },
                    },
                }],
                payment_intent_data: {
                    statement_descriptor_suffix: 'LMS',
                    metadata: { entryId: request.entryId, kind: request.kind },
                },
                success_url: request.successUrl,
                cancel_url: request.cancelUrl,
                expires_at: Math.floor(Math.max(request.expiresAt.getTime(), earliest) / 1000),
            })

            if (session.url === null) {
                throw new Error('Stripe did not return a checkout address.')
            }

            return { sessionId: session.id, url: session.url }
        },
        retrieveCheckout: async (sessionId) => {
            return stripe.checkout.sessions.retrieve(sessionId)
        },
        feeCents: async (paymentIntentId) => {
            const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
                expand: ['latest_charge.balance_transaction'],
            })
            const charge = intent.latest_charge
            if (charge === null || typeof charge === 'string') {
                return 0
            }

            const balance = charge.balance_transaction
            return balance === null || typeof balance === 'string' ? 0 : balance.fee
        },
        refund: async (paymentIntentId) => {
            await stripe.refunds.create({ payment_intent: paymentIntentId })
        },
    }
}

/** Checks the Stripe-Signature header. Throws if the event is not really from Stripe. */
export function verifyWebhook(rawBody: string, signature: string, webhookSecret: string): Stripe.Event {
    return Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
}

export function gatewayFromEnv(): PaymentGateway {
    const key = process.env['STRIPE_SECRET_KEY'] ?? ''
    if (key === '') {
        throw new Error('STRIPE_SECRET_KEY is not set.')
    }

    return stripeGateway(key)
}
