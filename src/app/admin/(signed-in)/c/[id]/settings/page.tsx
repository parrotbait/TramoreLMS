// Created by Claude driven by Eddie Long on 2026-11-04.

import { setEntriesOpenAction, updateCompetitionAction } from '@/admin/actions'
import { loadAdminCompetition } from '@/admin/load'
import { CompetitionNav } from '@/components/admin/CompetitionNav'
import { Card, Field, Submit } from '@/components/admin/ui'

interface SettingsProps {
    readonly params: Promise<{ readonly id: string }>
}

export default async function CompetitionSettings({ params }: SettingsProps) {
    const { id } = await params
    const { rows, currentWeek } = await loadAdminCompetition(id)
    const competition = rows.competition
    const euro = (cents: number) => {
        return (cents / 100).toFixed(2)
    }

    return (
        <>
            <CompetitionNav competitionId={id} name={competition.name} currentWeek={currentWeek} />

            <Card title="Entries">
                <p className="text-sm text-muted">
                    {competition.entriesOpen
                        ? 'Entries are open: the Enter button is on the home page until the Week 1 cut-off.'
                        : competition.status === 'draft'
                            ? 'This competition is a draft. Opening entries makes it live.'
                            : 'Entries are closed.'}
                </p>
                <form action={setEntriesOpenAction.bind(null, id, !competition.entriesOpen)}>
                    <Submit tone={competition.entriesOpen ? 'danger' : 'primary'}>
                        {competition.entriesOpen ? 'Close entries' : 'Open entries'}
                    </Submit>
                </form>
            </Card>

            <Card title="Settings">
                <form action={updateCompetitionAction.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
                    <Field label="Name" name="name" defaultValue={competition.name} required />
                    <Field
                        label="Start at PL Matchday"
                        name="startMatchday"
                        type="number"
                        defaultValue={String(competition.startMatchday)}
                        hint={competition.status === 'draft' ? 'Changing it reloads the fixtures.' : 'Fixed once the competition is live.'}
                    />
                    <Field label="Entry fee (€)" name="entryFee" defaultValue={euro(competition.entryFeeCents)} required hint="Fixed once Week 1 locks." />
                    <Field label="Buy-back fee (€)" name="buybackFee" defaultValue={euro(competition.buybackFeeCents)} required />
                    <Field label="Prize (€)" name="prize" defaultValue={euro(competition.prizeCents)} required />
                    <label className="flex items-center gap-2 self-end text-sm">
                        <input type="checkbox" name="showRaised" defaultChecked={competition.showRaised} className="h-5 w-5" />
                        Show “€X raised for the club” on the home page
                    </label>
                    <div>
                        <Submit>Save settings</Submit>
                    </div>
                </form>
            </Card>
        </>
    )
}
