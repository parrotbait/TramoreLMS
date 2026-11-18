// Created by Claude driven by Eddie Long on 2026-11-18.
//
// The sign-up on a demo invite link. It is the real sign-up: the same form,
// the same Stripe page, the same “you’re in” page. The entry goes into the
// demo, not the real competition. Stripe must be in test mode, so no real
// card is ever charged for a demo.

'use server'

import { getDatabase } from '@/db/client'
import type { EntryFormState } from '@/payments/actions'
import { goToCheckout, paymentEnvironment } from '@/payments/checkout-start'
import { startEntry } from '@/payments/service'
import type { CheckoutStart } from '@/payments/service'

import { isDemoLinkUsable } from './join-link'

export async function joinDemoAction(
    code: string,
    _previous: EntryFormState,
    formData: FormData,
): Promise<EntryFormState> {
    const values = {
        displayName: String(formData.get('displayName') ?? ''),
        email: String(formData.get('email') ?? ''),
    }

    const demo = await isDemoLinkUsable(getDatabase(), code)
    if (demo === null) {
        return { values, errors: {}, problem: 'closed' }
    }

    let checkout: CheckoutStart
    try {
        const result = await startEntry(paymentEnvironment(), values, { demoCompetitionId: demo.id })
        switch (result.kind) {
            case 'invalid':
                return { values, errors: result.errors, problem: null }
            case 'nameTaken':
                return { values, errors: {}, problem: 'nameTaken' }
            case 'closed':
                return { values, errors: {}, problem: 'closed' }
            case 'checkout':
                checkout = result.checkout
                break
        }
    } catch (error) {
        console.error('Could not start a demo entry:', error)
        return { values, errors: {}, problem: 'paymentUnavailable' }
    }

    return goToCheckout(checkout)
}
