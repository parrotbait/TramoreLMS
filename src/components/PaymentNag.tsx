// Created by Claude driven by Eddie Long on 2026-11-01.
//
// Shown instead of the pick screen when the signed-in person has not paid.

import Link from 'next/link'
import type { ReactNode } from 'react'

import type { EntryGate, MyEntry } from '@/entries/gate'
import { formatDublin, formatEuro } from '@/lib/format'

type NotReady = Exclude<EntryGate, { kind: 'ready' }>

export function PaymentNag({ gate, payAction }: {
    readonly gate: NotReady
    readonly payAction?: ((formData: FormData) => Promise<void>) | undefined
}) {
    switch (gate.kind) {
        case 'paymentPending':
            return <FinishPayment entry={gate.entry} payAction={payAction} />
        case 'holdExpired':
            return (
                <Notice title="Your payment didn’t go through">
                    <p>
                        The hold on the name “{gate.entry.displayName}” has ended, so someone else may take it.
                        Start your entry again to play.
                    </p>
                    <EnterLink label="Enter again" />
                </Notice>
            )
        case 'withdrawn':
            return (
                <Notice title="Your entry was withdrawn">
                    <p>If you think this is a mistake, contact the organiser.</p>
                </Notice>
            )
        case 'noEntry':
            return (
                <Notice title="You don’t have an entry yet">
                    <p>Enter for the season to start picking.</p>
                    <EnterLink label="Enter now" />
                </Notice>
            )
    }
}

/**
 * Shown above the pick screen when the same email also has an unpaid entry,
 * for example one started for a family member. Each one gets a Pay button.
 */
export function UnpaidReminder({ entries, payAction }: {
    readonly entries: readonly MyEntry[]
    readonly payAction?: ((formData: FormData) => Promise<void>) | undefined
}) {
    if (entries.length === 0) {
        return null
    }

    return (
        <ul className="space-y-2">
            {entries.map((entry) => {
                return (
                    <li key={entry.entryId} className="space-y-2 rounded-xl border-2 border-gold bg-subtle px-3 py-3 text-sm">
                        <p>You have another entry, “{entry.displayName}”, that isn’t paid yet.</p>
                        <form action={payAction}>
                            <input type="hidden" name="entryId" value={entry.entryId} />
                            <button
                                type="submit"
                                disabled={payAction === undefined}
                                className="min-h-11 w-full rounded-xl bg-maroon font-bold text-on-maroon disabled:opacity-50"
                            >
                                Pay {formatEuro(entry.entryFeeCents)} for “{entry.displayName}”
                            </button>
                        </form>
                    </li>
                )
            })}
        </ul>
    )
}

function FinishPayment({ entry, payAction }: {
    readonly entry: MyEntry
    readonly payAction?: ((formData: FormData) => Promise<void>) | undefined
}) {
    const fee = formatEuro(entry.entryFeeCents)
    const holdUntil = entry.holdExpiresAt === null ? null : formatDublin(entry.holdExpiresAt)

    return (
        <Notice title="Finish your payment">
            <p>
                Your entry “{entry.displayName}” in {entry.competitionName} isn’t paid yet.
                You can pick once your {fee} entry fee is through.
            </p>
            {holdUntil === null ? null : <p>We’re holding the name until {holdUntil}.</p>}
            <form action={payAction}>
                <input type="hidden" name="entryId" value={entry.entryId} />
                <button
                    type="submit"
                    disabled={payAction === undefined}
                    className="min-h-12 w-full rounded-xl bg-maroon font-bold text-on-maroon disabled:opacity-50"
                >
                    Pay {fee}
                </button>
            </form>
        </Notice>
    )
}

function Notice({ title, children }: { readonly title: string; readonly children: ReactNode }) {
    return (
        <section className="space-y-3 rounded-2xl border-2 border-maroon bg-surface px-4 py-4 text-sm text-muted">
            <h2 className="text-lg font-bold text-ink">{title}</h2>
            {children}
        </section>
    )
}

function EnterLink({ label }: { readonly label: string }) {
    return (
        <Link href="/enter" className="block min-h-12 rounded-xl bg-maroon px-4 py-3 text-center font-bold text-on-maroon">
            {label}
        </Link>
    )
}
