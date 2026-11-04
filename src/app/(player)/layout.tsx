// Created by Claude driven by Eddie Long on 2026-11-03.
//
// The player area: Pick, Picks and Standings. Signed-in players only
// (Decision 19). Unpaid people see the payment screen, not the game.

import type { ReactNode } from 'react'

import { signOutAction } from '@/auth/actions'
import { EntrySwitcher } from '@/components/EntrySwitcher'
import { PaymentNag, UnpaidReminder } from '@/components/PaymentNag'
import { SiteHeader } from '@/components/SiteHeader'
import { payAction } from '@/payments/actions'
import { selectEntryAction } from '@/player/actions'
import { loadPlayerPage } from '@/player/load'

export const dynamic = 'force-dynamic'

const LINKS = [
    { href: '/pick', label: 'Pick' },
    { href: '/picks', label: 'Picks' },
    { href: '/standings', label: 'Standings' },
] as const

export default async function PlayerLayout({ children }: { readonly children: ReactNode }) {
    const page = await loadPlayerPage()

    return (
        <>
            <SiteHeader homeHref="/pick" links={page.kind === 'ready' ? LINKS : []} />
            {page.kind === 'ready'
                ? (
                    <div className="bg-maroon">
                        <EntrySwitcher
                            entries={page.paidEntries}
                            selectedId={page.entry.entryId}
                            action={selectEntryAction}
                        />
                    </div>
                )
                : null}
            <main className="mx-auto max-w-5xl space-y-4 px-4 py-4 pb-16">
                {page.kind === 'ready'
                    ? (
                        <>
                            <div className="mx-auto max-w-md">
                                <UnpaidReminder entries={page.unpaidEntries} payAction={payAction} />
                            </div>
                            {children}
                        </>
                    )
                    : (
                        <div className="mx-auto max-w-md">
                            <PaymentNag gate={page.gate} payAction={payAction} />
                        </div>
                    )}
                <footer className="mx-auto flex max-w-md items-center justify-between gap-2 pt-4 text-xs text-muted">
                    <span className="truncate">Signed in as {page.session.email}</span>
                    <form action={signOutAction}>
                        <button type="submit" className="min-h-9 rounded-lg border border-line px-3 font-semibold text-ink">Sign out</button>
                    </form>
                </footer>
            </main>
        </>
    )
}
