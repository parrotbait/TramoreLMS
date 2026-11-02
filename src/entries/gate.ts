// Created by Claude driven by Eddie Long on 2026-11-01.
//
// What a signed-in person can do, given their entries. Only an active (paid)
// entry can pick. Anyone with an unpaid entry is asked to finish paying.
// Pure, so it is unit tested.

export type EntryStatus =
    | 'pending'
    | 'active'
    | 'withdrawn'
    | 'expired'

export interface MyEntry {
    readonly entryId: string
    readonly competitionId: string
    readonly competitionName: string
    readonly displayName: string
    readonly status: EntryStatus
    /** When the name hold ends, for a pending entry (Decision 18). */
    readonly holdExpiresAt: Date | null
    readonly entryFeeCents: number
}

export type EntryGate =
    /** At least one paid entry. `unpaid` lists other entries still waiting for payment. */
    | { readonly kind: 'ready'; readonly paid: readonly MyEntry[]; readonly unpaid: readonly MyEntry[] }
    | { readonly kind: 'paymentPending'; readonly entry: MyEntry }
    | { readonly kind: 'holdExpired'; readonly entry: MyEntry }
    | { readonly kind: 'withdrawn' }
    | { readonly kind: 'noEntry' }

export function entryGate(entries: readonly MyEntry[], now: Date): EntryGate {
    const paid = entries.filter((entry) => {
        return entry.status === 'active'
    })
    const unpaid = entries.filter((entry) => {
        return entry.status === 'pending' && isHeld(entry, now)
    })

    if (paid.length > 0) {
        return { kind: 'ready', paid, unpaid }
    }

    const held = unpaid[0]
    if (held !== undefined) {
        return { kind: 'paymentPending', entry: held }
    }

    const expired = entries.find((entry) => {
        return entry.status === 'pending' || entry.status === 'expired'
    })
    if (expired !== undefined) {
        return { kind: 'holdExpired', entry: expired }
    }

    if (entries.length > 0) {
        return { kind: 'withdrawn' }
    }

    return { kind: 'noEntry' }
}

function isHeld(entry: MyEntry, now: Date): boolean {
    return entry.holdExpiresAt !== null && entry.holdExpiresAt.getTime() > now.getTime()
}
