// Created by Claude driven by Eddie Long on 2026-11-02.

import Stripe from 'stripe'
import { describe, expect, it } from 'vitest'

import { verifyWebhook } from '../stripe'
import { commandFromEvent } from '../webhook-events'

const SECRET = 'whsec_test_secret_for_unit_tests'

function checkoutEvent(type: string, session: Record<string, unknown>): Stripe.Event {
    return {
        id: 'evt_1',
        object: 'event',
        type,
        data: {
            object: {
                id: 'cs_test_1',
                object: 'checkout.session',
                payment_status: 'paid',
                amount_total: 1000,
                payment_intent: 'pi_1',
                client_reference_id: 'entry-1',
                metadata: { entryId: 'entry-1', kind: 'entry' },
                ...session,
            },
        },
    } as unknown as Stripe.Event
}

describe('commandFromEvent', () => {
    it('turns a paid Checkout into a payment to confirm', () => {
        expect(commandFromEvent(checkoutEvent('checkout.session.completed', {}))).toEqual({
            kind: 'paid',
            sessionId: 'cs_test_1',
            entryId: 'entry-1',
            paymentKind: 'entry',
            amountCents: 1000,
            paymentIntentId: 'pi_1',
        })
    })

    it('reads a buy-back', () => {
        const event = checkoutEvent('checkout.session.completed', { metadata: { entryId: 'entry-1', kind: 'buyback' }, amount_total: 500 })
        expect(commandFromEvent(event)).toMatchObject({ kind: 'paid', paymentKind: 'buyback', amountCents: 500 })
    })

    it('waits when Checkout completes before a delayed payment has arrived', () => {
        expect(commandFromEvent(checkoutEvent('checkout.session.completed', { payment_status: 'unpaid' }))).toEqual({ kind: 'ignore' })
    })

    it('confirms a delayed payment when it succeeds', () => {
        expect(commandFromEvent(checkoutEvent('checkout.session.async_payment_succeeded', {})).kind).toBe('paid')
    })

    it('marks an expired or failed Checkout as failed', () => {
        expect(commandFromEvent(checkoutEvent('checkout.session.expired', {}))).toEqual({ kind: 'failed', sessionId: 'cs_test_1' })
        expect(commandFromEvent(checkoutEvent('checkout.session.async_payment_failed', {}))).toEqual({
            kind: 'failed',
            sessionId: 'cs_test_1',
        })
    })

    it('ignores a Checkout that is not one of ours', () => {
        expect(commandFromEvent(checkoutEvent('checkout.session.completed', { metadata: {}, client_reference_id: null }))).toEqual({
            kind: 'ignore',
        })
    })

    it('ignores other events', () => {
        expect(commandFromEvent(checkoutEvent('customer.created', {}))).toEqual({ kind: 'ignore' })
    })
})

describe('verifyWebhook', () => {
    const body = JSON.stringify(checkoutEvent('checkout.session.completed', {}))

    it('accepts an event signed with our secret', () => {
        const signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET })
        expect(verifyWebhook(body, signature, SECRET).type).toBe('checkout.session.completed')
    })

    it('rejects an event signed with another secret', () => {
        const signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: 'whsec_someone_else' })
        expect(() => {
            return verifyWebhook(body, signature, SECRET)
        }).toThrow()
    })

    it('rejects an event changed after it was signed', () => {
        const signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET })
        const tampered = body.replace('"amount_total":1000', '"amount_total":1')
        expect(() => {
            return verifyWebhook(tampered, signature, SECRET)
        }).toThrow()
    })

    it('rejects an event with no signature', () => {
        expect(() => {
            return verifyWebhook(body, '', SECRET)
        }).toThrow()
    })
})
