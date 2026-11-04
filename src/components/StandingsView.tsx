// Created by Claude driven by Eddie Long on 2026-10-31.
//
// The standings page: headline, winner, then the week-by-week grid.

import type { EntryId } from '@/engine'
import type { ProgressionModel } from '@/view-models/progression'
import type { StandingsModel } from '@/view-models/standings'

import { ProgressionGrid } from './ProgressionGrid'

interface StandingsViewProps {
    readonly model: StandingsModel
    readonly progression: ProgressionModel
    readonly highlightEntryId?: EntryId
}

export function StandingsView({ model, progression, highlightEntryId }: StandingsViewProps) {
    return (
        <div className="space-y-4">
            <header>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {model.lastSettledWeek === 0 ? 'Before Week 1' : `After Week ${model.lastSettledWeek}`}
                </p>
                <h2 className="text-2xl font-bold">{model.headline}</h2>
                {model.winnerLine !== null
                    ? <p className="mt-2 rounded-2xl bg-gold px-4 py-3 font-bold text-on-gold">{model.winnerLine}</p>
                    : null}
                {model.provisionallyOut.length > 0
                    ? (
                        <p className="mt-1 text-sm text-muted">
                            {model.provisionallyOut.length} may be out.
                            If everyone left goes out this week, they all stay in.
                        </p>
                    )
                    : null}
            </header>

            <ProgressionGrid model={progression} {...(highlightEntryId === undefined ? {} : { highlightEntryId })} />
        </div>
    )
}
