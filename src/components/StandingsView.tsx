// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Who is in and who is out. ✓ and ✗ as well as colour, so the status does
// not rely on colour alone.

import type { StandingsModel } from '@/view-models/standings'

import { TeamCrest } from './TeamCrest'

export function StandingsView({ model }: { readonly model: StandingsModel }) {
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
            </header>

            <section>
                <h3 className="mb-2 font-bold">Still in</h3>
                <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {model.stillIn.map((row) => {
                        return (
                            <li key={row.entryId} className="rounded-xl border border-gold bg-surface px-3 py-2 text-sm font-medium">
                                <span aria-hidden="true">✓ </span>{row.name}
                            </li>
                        )
                    })}
                    {model.provisionallyOut.map((row) => {
                        return (
                            <li key={row.entryId} className="rounded-xl border border-line bg-subtle px-3 py-2 text-sm">
                                <span aria-hidden="true">? </span>{row.name}
                                <span className="block text-xs text-muted">Out unless everyone goes out</span>
                            </li>
                        )
                    })}
                </ul>
            </section>

            {model.out.length > 0
                ? (
                    <section>
                        <h3 className="mb-2 font-bold">Out</h3>
                        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                            {model.out.map((row) => {
                                return (
                                    <li key={row.entryId} className="flex justify-between gap-2 px-3 py-2 text-sm text-muted">
                                        <span className="line-through"><span aria-hidden="true">✗ </span>{row.name}</span>
                                        <span className="inline-flex items-center gap-1.5">
                                            Week {row.week} ·
                                            <TeamCrest name={row.teamName} src={row.crestUrl} size={16} />
                                            {row.teamName}
                                        </span>
                                    </li>
                                )
                            })}
                        </ul>
                    </section>
                )
                : null}
        </div>
    )
}
