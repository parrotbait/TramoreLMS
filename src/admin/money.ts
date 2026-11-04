// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Money for the dashboard and the treasurer (Decision 18). Pure.
// Only paid payments count towards money raised. Refunds are shown apart.

export type PaymentKind =
    | 'entry'
    | 'buyback'

export type PaymentMethod =
    | 'stripe'
    | 'cash'
    | 'revolut'
    | 'other'

export type PaymentStatus =
    | 'pending'
    | 'paid'
    | 'refunded'
    | 'failed'

export interface MoneyPayment {
    readonly kind: PaymentKind
    readonly method: PaymentMethod
    readonly status: PaymentStatus
    readonly amountCents: number
    readonly feeCents: number
}

export interface MoneyTotals {
    readonly entryCount: number
    readonly entryCents: number
    readonly buybackCount: number
    readonly buybackCents: number
    readonly grossCents: number
    readonly feesCents: number
    readonly refundedCents: number
    readonly prizeCents: number
    /** What the club keeps: paid money, less Stripe fees, less the prize. */
    readonly netRaisedCents: number
    readonly byMethod: Readonly<Record<PaymentMethod, number>>
}

export function moneyTotals(payments: readonly MoneyPayment[], prizeCents: number): MoneyTotals {
    const paid = payments.filter((payment) => {
        return payment.status === 'paid'
    })
    const sum = (items: readonly MoneyPayment[], pick: (payment: MoneyPayment) => number) => {
        return items.reduce((total, payment) => {
            return total + pick(payment)
        }, 0)
    }
    const ofKind = (kind: PaymentKind) => {
        return paid.filter((payment) => {
            return payment.kind === kind
        })
    }

    const byMethod: Record<PaymentMethod, number> = { stripe: 0, cash: 0, revolut: 0, other: 0 }
    for (const payment of paid) {
        byMethod[payment.method] += payment.amountCents
    }

    const grossCents = sum(paid, (payment) => {
        return payment.amountCents
    })
    const feesCents = sum(paid, (payment) => {
        return payment.feeCents
    })

    return {
        entryCount: ofKind('entry').length,
        entryCents: sum(ofKind('entry'), (payment) => {
            return payment.amountCents
        }),
        buybackCount: ofKind('buyback').length,
        buybackCents: sum(ofKind('buyback'), (payment) => {
            return payment.amountCents
        }),
        grossCents,
        feesCents,
        refundedCents: sum(payments.filter((payment) => {
            return payment.status === 'refunded'
        }), (payment) => {
            return payment.amountCents
        }),
        prizeCents,
        netRaisedCents: grossCents - feesCents - prizeCents,
        byMethod,
    }
}
