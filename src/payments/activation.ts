// Created by Claude driven by Eddie Long on 2026-11-02.
//
// What a confirmed Stripe payment should do, given the state it finds.
// Pure, so it is unit tested. The webhook handler applies the decision in
// one transaction.
//
// A payment is always honoured (Decision 18). If the name hold ran out and
// someone else took the name, the entry becomes active as “Name (2)” and the
// admin is told.

import type { EntryStatus } from '@/entries/gate'

import { nameWithSuffix } from './entry-rules'

export type PaymentKind =
    | 'entry'
    | 'buyback'

export type PaymentStatus =
    | 'pending'
    | 'paid'
    | 'refunded'
    | 'failed'

export interface ActivationInput {
    readonly kind: PaymentKind
    readonly paymentStatus: PaymentStatus
    readonly entryStatus: EntryStatus
    readonly displayName: string
    /** Name keys used by other pending or active entries in the competition. */
    readonly takenKeys: ReadonlySet<string>
    readonly ownKey: string
    readonly isBuybackOpen: boolean
}

export type ActivationAlert =
    | 'renamed'
    | 'paidWhileWithdrawn'
    | 'duplicatePayment'
    | 'lateBuyback'
    | 'buybackForInactiveEntry'

export type ActivationDecision =
    /** Stripe sent this event before. Nothing to do. */
    | { readonly kind: 'alreadyRecorded' }
    | { readonly kind: 'activate'; readonly displayName: string; readonly alert: ActivationAlert | null }
    | { readonly kind: 'buyback'; readonly alert: ActivationAlert | null }
    /** Keep the money on record, change nothing else, and ask the admin to sort it out. */
    | { readonly kind: 'recordOnly'; readonly alert: ActivationAlert }

export function decideActivation(input: ActivationInput): ActivationDecision {
    if (input.paymentStatus === 'paid' || input.paymentStatus === 'refunded') {
        return { kind: 'alreadyRecorded' }
    }

    if (input.kind === 'buyback') {
        if (input.entryStatus !== 'active') {
            return { kind: 'recordOnly', alert: 'buybackForInactiveEntry' }
        }

        return { kind: 'buyback', alert: input.isBuybackOpen ? null : 'lateBuyback' }
    }

    switch (input.entryStatus) {
        case 'active':
            return { kind: 'recordOnly', alert: 'duplicatePayment' }
        case 'withdrawn':
            return { kind: 'recordOnly', alert: 'paidWhileWithdrawn' }
        case 'pending':
        case 'expired':
            break
    }

    const isNameFree = !input.takenKeys.has(input.ownKey)
    if (isNameFree) {
        return { kind: 'activate', displayName: input.displayName, alert: null }
    }

    return { kind: 'activate', displayName: nameWithSuffix(input.displayName, input.takenKeys), alert: 'renamed' }
}
