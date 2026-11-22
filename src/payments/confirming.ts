// Created by Claude driven by Eddie Long on 2026-11-22.
//
// The “Confirming your payment” page checks again every few seconds, through
// /enter/complete, which asks Stripe. A tab left open on a payment that never
// finishes must not ask Stripe for ever. After a number of tries the page stops
// and offers a button instead. Pure, so it is tested.

export const MAX_CONFIRM_ATTEMPTS = 20

/** The number of automatic checks so far, from the address. Anything odd counts as the start. */
export function attemptOf(raw: string | null | undefined): number {
    const attempt = Number(raw)
    if (!Number.isInteger(attempt) || attempt < 0) {
        return 0
    }

    return Math.min(attempt, MAX_CONFIRM_ATTEMPTS)
}

export function shouldKeepChecking(attempt: number): boolean {
    return attempt < MAX_CONFIRM_ATTEMPTS
}
