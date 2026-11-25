// Created by Claude driven by Eddie Long on 2026-11-18.
//
// The two helpers every “go and pay” action needs. They are not in actions.ts
// because a 'use server' file turns every export into an address a browser
// can call, and these must only ever be called from our own actions.

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { requestSiteUrl } from '@/auth/session'
import { getDatabase } from '@/db/client'
import { mailerFromEnv } from '@/email/mailer'

import { CHECKOUT_COOKIE } from './checkout-cookie'
import type { CheckoutStart, PaymentEnvironment } from './service'
import { gatewayFromEnv } from './stripe'

/**
 * Keeps the checkout token in this browser, then opens Stripe. Coming back
 * from Stripe with it signs this browser in (/enter/complete).
 */
export async function goToCheckout(checkout: CheckoutStart): Promise<never> {
    (await cookies()).set(CHECKOUT_COOKIE, checkout.checkoutToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/enter',
        maxAge: 2 * 60 * 60,
    })
    redirect(checkout.url)
}

export async function paymentEnvironment(): Promise<PaymentEnvironment> {
    return {
        db: getDatabase(),
        gateway: gatewayFromEnv(),
        mailer: mailerFromEnv(),
        now: new Date(),
        siteUrl: await requestSiteUrl(),
        adminEmails: process.env['ADMIN_EMAILS'],
    }
}
