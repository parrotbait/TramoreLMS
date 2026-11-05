// Created by Claude driven by Eddie Long on 2026-11-04.

import Link from 'next/link'

import { createCompetitionAction } from '@/admin/actions'
import { listCompetitions } from '@/admin/load'
import { Card, Field, Submit } from '@/components/admin/ui'
import { getDatabase } from '@/db/client'
import { formatEuro } from '@/lib/format'
import { openCompetitionForEntries } from '@/payments/service'

export default async function AdminHomePage() {
    const competitions = await listCompetitions()
    const takingEntries = await openCompetitionForEntries(getDatabase(), new Date())

    return (
        <>
            <Card title="Competitions">
                {competitions.length === 0
                    ? <p className="text-sm text-muted">No competitions yet. Create the first one below.</p>
                    : (
                        <table className="w-full text-left text-sm">
                            <thead className="text-xs text-muted">
                                <tr>
                                    <th className="py-1">Name</th>
                                    <th>Status</th>
                                    <th>Starts</th>
                                    <th>Paid entries</th>
                                    <th>Entry</th>
                                </tr>
                            </thead>
                            <tbody>
                                {competitions.map((competition) => {
                                    return (
                                        <tr key={competition.id} className="border-t border-line">
                                            <td className="py-2">
                                                <Link href={`/admin/c/${competition.id}`} className="font-semibold text-maroon underline">
                                                    {competition.name}
                                                </Link>
                                            </td>
                                            <td>
                                                {statusLabel(competition.status)}
                                                {competition.isDemo
                                                    ? <span className="ml-2 rounded bg-subtle px-1.5 py-0.5 text-xs font-semibold">Demo</span>
                                                    : null}
                                                {competition.id === takingEntries?.id
                                                    ? <span className="ml-2 rounded bg-gold px-1.5 py-0.5 text-xs font-semibold text-on-gold">Taking entries</span>
                                                    : null}
                                            </td>
                                            <td>PL Matchday {competition.startMatchday}</td>
                                            <td className="tabular-nums">{competition.activeEntries}</td>
                                            <td>{formatEuro(competition.entryFeeCents)}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
            </Card>

            <Card title="New competition">
                <p className="text-sm text-muted">
                    Loads the 2026/27 fixtures from football-data.org.
                    It starts as a draft: nobody can enter until you open entries.
                </p>
                <form action={createCompetitionAction} className="grid gap-3 sm:grid-cols-2">
                    <Field label="Name" name="name" defaultValue="Last Man Standing 2026/27" />
                    <Field label="Start at PL Matchday" name="startMatchday" type="number" defaultValue="12" required hint="Week 1 is this matchday." />
                    <Field label="Entry fee (€)" name="entryFee" defaultValue="10" required />
                    <Field label="Buy-back fee (€)" name="buybackFee" defaultValue="5" required />
                    <Field label="Prize (€)" name="prize" defaultValue="300" required />
                    <div className="flex items-end">
                        <Submit>Create competition</Submit>
                    </div>
                </form>
            </Card>
        </>
    )
}

function statusLabel(status: string): string {
    switch (status) {
        case 'draft':
            return 'Draft'
        case 'open':
            return 'Open'
        case 'running':
            return 'Running'
        case 'finished':
            return 'Finished'
        default:
            return status
    }
}
