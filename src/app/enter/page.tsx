// Created by Claude driven by Eddie Long on 2026-11-02.

import Link from 'next/link'

import { AuthCard } from '@/components/AuthCard'
import { EntryForm } from '@/components/EntryForm'
import { getDatabase } from '@/db/client'
import { formatEuro } from '@/lib/format'
import { startEntryAction } from '@/payments/actions'
import { openCompetitionForEntries } from '@/payments/service'

export const dynamic = 'force-dynamic'

export default async function EnterPage() {
    const competition = await openCompetitionForEntries(getDatabase(), new Date())

    if (competition === null) {
        return (
            <AuthCard title="Entries are closed">
                <p className="text-sm text-muted">You can’t enter right now.</p>
                <Link href="/signin" className="block text-sm font-semibold text-maroon underline">Already entered? Sign in</Link>
            </AuthCard>
        )
    }

    const fee = formatEuro(competition.entryFeeCents)

    return (
        <AuthCard title={`Enter ${competition.name}`}>
            <p className="text-sm text-muted">
                Entry is {fee}. You pay by card on the next page. There is no password. We email you a link to sign in.
            </p>
            <EntryForm action={startEntryAction} feeLabel={fee} />
            <p className="text-xs text-muted">
                By entering you agree to the <Link href="/rules" className="underline">rules</Link> and the{' '}
                <Link href="/privacy" className="underline">privacy notice</Link>.
            </p>
        </AuthCard>
    )
}
