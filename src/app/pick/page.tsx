// Created by Claude driven by Eddie Long on 2026-11-01.
//
// Placeholder pick page, so sign-in and the payment gate can be tested.
// The real pick page comes in build step 9.

import { redirect } from 'next/navigation'

import { signOutAction } from '@/auth/actions'
import { currentSession } from '@/auth/session'
import { AuthCard } from '@/components/AuthCard'
import { PaymentNag, UnpaidReminder } from '@/components/PaymentNag'
import { getDatabase } from '@/db/client'
import { entryGate } from '@/entries/gate'
import { entriesForPerson } from '@/entries/queries'

export const dynamic = 'force-dynamic'

export default async function PickPage() {
    const session = await currentSession()
    if (session === null) {
        redirect('/signin?next=/pick')
    }

    const gate = entryGate(await entriesForPerson(getDatabase(), session.personId), new Date())

    return (
        <AuthCard title={gate.kind === 'ready' ? 'You’re signed in' : 'Before you pick'}>
            <p className="text-sm text-muted">Signed in as <strong className="text-ink">{session.email}</strong>.</p>
            {gate.kind === 'ready'
                ? (
                    <>
                        <UnpaidReminder entries={gate.unpaid} />
                        <p className="text-sm text-muted">
                            Paid entries: {gate.paid.map((entry) => {
                                return entry.displayName
                            }).join(', ')}. The pick screen arrives in build step 9.
                        </p>
                    </>
                )
                : <PaymentNag gate={gate} />}
            <form action={signOutAction}>
                <button type="submit" className="min-h-11 w-full rounded-xl border border-line font-semibold">Sign out</button>
            </form>
        </AuthCard>
    )
}
