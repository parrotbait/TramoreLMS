// Created by Claude driven by Eddie Long on 2026-11-04.

import Form from 'next/form'

import {
    addEntryAction,
    changeEmailAction,
    recordBuybackAction,
    removePersonAction,
    renameEntryAction,
    withdrawEntryAction,
} from '@/admin/actions'
import { matchesSearch, withdrawalWeek } from '@/admin/forms'
import { loadAdminCompetition } from '@/admin/load'
import type { AdminCompetition, PaymentRow } from '@/admin/load'
import { CompetitionNav } from '@/components/admin/CompetitionNav'
import { ActionPanel, Card, Field, MethodField, ReasonField, Submit } from '@/components/admin/ui'
import { isBuybackAvailable } from '@/engine'
import { formatDublin, formatEuro } from '@/lib/format'

interface EntriesProps {
    readonly params: Promise<{ readonly id: string }>
    readonly searchParams: Promise<{ readonly q?: string }>
}

export default async function EntriesPage({ params, searchParams }: EntriesProps) {
    const { id } = await params
    const query = ((await searchParams).q ?? '').trim()
    const data = await loadAdminCompetition(id)
    const { rows, currentWeek } = data
    const isBeforeWeekOne = withdrawalWeek(data.state.weeks, data.context.now) === 1
    const buybackFee = (rows.competition.buybackFeeCents / 100).toFixed(2)
    const sorted = [...rows.entries]
        .filter((entry) => {
            return matchesSearch(query, entry.displayName, data.emailOf.get(entry.id) ?? '')
        })
        .sort((left, right) => {
            return left.displayName.localeCompare(right.displayName)
        })

    return (
        <>
            <CompetitionNav competitionId={id} name={rows.competition.name} currentWeek={currentWeek} />

            <Card title="Add a player who paid cash or Revolut">
                <form action={addEntryAction.bind(null, id)} className="grid gap-3 sm:grid-cols-5">
                    <Field label="Name on the standings" name="displayName" required placeholder="Seán M" />
                    <Field label="Email" name="email" type="email" required />
                    <MethodField />
                    <Field
                        label="Amount (€)"
                        name="amount"
                        defaultValue={(rows.competition.entryFeeCents / 100).toFixed(2)}
                        hint="Counts towards the totals."
                    />
                    <Field label="Note" name="note" placeholder="Paid at the clubhouse" />
                    <div>
                        <Submit pendingLabel="Adding and emailing…">Add player</Submit>
                    </div>
                </form>
            </Card>

            <Card title="Find a player">
                <Form action={`/admin/c/${id}/entries`} className="flex flex-wrap items-end gap-3">
                    <div className="min-w-0 flex-1">
                        <Field label="Name or email" name="q" defaultValue={query} placeholder="Seán, or part of an email" />
                    </div>
                    <Submit tone="plain" pendingLabel="Searching…">Search</Submit>
                </Form>
                {query === ''
                    ? null
                    : (
                        <p className="text-sm text-muted">
                            Showing {sorted.length} of {rows.entries.length}.{' '}
                            <a href={`/admin/c/${id}/entries`} className="font-semibold text-maroon underline">Show everyone</a>
                        </p>
                    )}
            </Card>

            <Card
                title={query === '' ? `Entries (${rows.entries.length})` : `Entries (${sorted.length} found)`}
                actions={<a href={`/admin/c/${id}/payments.csv`} className="text-sm font-semibold text-maroon underline">Download CSV</a>}
            >
                <ul className="divide-y divide-line">
                    {sorted.map((entry) => {
                        const entryPayments = data.paymentsByEntry.get(entry.id) ?? []
                        const canBuyBack = entry.status === 'active'
                            && isBuybackAvailable(data.state, data.standings, data.context.now, entry.id)
                        return (
                            <li key={entry.id} className="space-y-2 py-3">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <div>
                                        <p className="font-semibold">{entry.displayName}</p>
                                        <p className="text-sm break-all">
                                            {isRemoved(data.emailOf.get(entry.id)) ? 'Email removed' : data.emailOf.get(entry.id)}
                                        </p>
                                    </div>
                                    <div className="text-right text-sm">
                                        <p className="font-semibold">{statusOf(entry, data)}</p>
                                        <p className="text-xs text-muted">{paymentsSummary(entryPayments)}</p>
                                    </div>
                                </div>
                                {entry.status === 'withdrawn'
                                    ? null
                                    : (
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <ActionPanel label="Rename">
                                                <form action={renameEntryAction.bind(null, entry.id)} className="space-y-2">
                                                    <Field label="New name" name="displayName" defaultValue={entry.displayName} required />
                                                    <ReasonField />
                                                    <Submit pendingLabel="Renaming…">Rename</Submit>
                                                </form>
                                            </ActionPanel>
                                            {isRemoved(data.emailOf.get(entry.id))
                                                ? null
                                                : (
                                                    <ActionPanel label="Correct their email">
                                                        <form action={changeEmailAction.bind(null, entry.id)} className="space-y-2">
                                                            <p className="text-xs text-muted">
                                                                For a typo. It changes for all of their entries.
                                                                We send them a sign-in link at the new address.
                                                            </p>
                                                            <Field
                                                                label="Right email"
                                                                name="email"
                                                                type="email"
                                                                defaultValue={data.emailOf.get(entry.id) ?? ''}
                                                                required
                                                            />
                                                            <ReasonField />
                                                            <Submit pendingLabel="Correcting…">Correct the email</Submit>
                                                        </form>
                                                    </ActionPanel>
                                                )}
                                            <ActionPanel label={isBeforeWeekOne ? 'Withdraw or refund' : 'Withdraw'}>
                                                <form action={withdrawEntryAction.bind(null, entry.id)} className="space-y-2">
                                                    {isBeforeWeekOne
                                                        ? (
                                                            <label className="flex items-center gap-2 text-sm">
                                                                <input type="checkbox" name="refund" className="h-5 w-5" />
                                                                Refund the entry fee too
                                                                (Stripe payments are refunded automatically)
                                                            </label>
                                                        )
                                                        : <p className="text-xs text-muted">No refunds after the Week 1 cut-off.</p>}
                                                    <ReasonField />
                                                    <Submit tone="danger" pendingLabel="Withdrawing…">Withdraw</Submit>
                                                </form>
                                            </ActionPanel>
                                            {canBuyBack
                                                ? (
                                                    <ActionPanel label="Record a buy-back">
                                                        <form action={recordBuybackAction.bind(null, entry.id)} className="space-y-2">
                                                            <MethodField />
                                                            <Field
                                                                label="Amount (€)"
                                                                name="amount"
                                                                defaultValue={buybackFee}
                                                            />
                                                            <Field label="Note" name="note" placeholder="Paid cash" />
                                                            <Submit pendingLabel="Recording…">Record buy-back</Submit>
                                                        </form>
                                                    </ActionPanel>
                                                )
                                                : null}
                                            <ActionPanel label="Remove their details (deletion request)">
                                                <form action={removePersonAction.bind(null, entry.id)} className="space-y-2">
                                                    <p className="text-xs text-muted">
                                                        Removes the email, and renames every entry for this email
                                                        to “Removed player”.
                                                        Picks stay in the history.
                                                    </p>
                                                    <Field label="Type REMOVE to confirm" name="confirm" required />
                                                    <ReasonField />
                                                    <Submit tone="danger" pendingLabel="Removing…">Remove details</Submit>
                                                </form>
                                            </ActionPanel>
                                        </div>
                                    )}
                            </li>
                        )
                    })}
                </ul>
            </Card>
        </>
    )
}

/** A person whose email was removed (on request, or by the 90-day clean-up) has a placeholder address. */
function isRemoved(email: string | undefined): boolean {
    return email?.endsWith('@removed.invalid') ?? false
}

function statusOf(entry: AdminCompetition['rows']['entries'][number], data: AdminCompetition): string {
    switch (entry.status) {
        case 'pending':
            return entry.holdExpiresAt === null ? 'Waiting for payment' : `Waiting for payment, name held until ${formatDublin(entry.holdExpiresAt)}`
        case 'expired':
            return 'Payment didn’t complete'
        case 'withdrawn':
            return `Withdrawn from Week ${entry.withdrawnFromWeek ?? 1}`
        case 'active':
            break
    }

    const standing = data.standings.entries.get(entry.id)
    switch (standing?.status) {
        case 'winner':
            return '🏆 Winner'
        case 'out':
            return `Out in Week ${standing.eliminatedInWeek ?? '?'}`
        case 'provisionallyOut':
            return 'Out, unless everyone goes out this week'
        default:
            return entry.boughtBack ? 'In (bought back)' : 'In'
    }
}

function paymentsSummary(entryPayments: readonly PaymentRow[]): string {
    if (entryPayments.length === 0) {
        return 'No payments'
    }

    return entryPayments.map((payment) => {
        const kind = payment.kind === 'buyback' ? 'buy-back' : 'entry'
        return `${formatEuro(payment.amountCents)} ${kind} · ${payment.method} · ${payment.status}`
    }).join(' / ')
}
