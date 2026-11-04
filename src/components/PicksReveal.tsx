// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Everyone's picks for a week, grouped by team. Read-only.

import Link from 'next/link'

import type { PicksRevealModel, RevealedPlayer } from '@/view-models/picks-reveal'

import { TeamCrest } from './TeamCrest'

interface PicksRevealProps {
    readonly model: PicksRevealModel
    readonly weekLinks: readonly { readonly weekNumber: number; readonly href: string }[]
}

export function PicksReveal({ model, weekLinks }: PicksRevealProps) {
    return (
        <div className="space-y-4">
            <WeekTabs current={model.weekNumber} links={weekLinks} />

            <header>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">PL Matchday {model.plMatchday}</p>
                <h2 className="text-2xl font-bold">Week {model.weekNumber} picks</h2>
            </header>

            {!model.isRevealed
                ? (
                    <section className="rounded-2xl border-2 border-line bg-subtle px-4 py-6 text-center">
                        <p className="text-3xl" aria-hidden="true">🔒</p>
                        <p className="mt-2 font-semibold">You can see picks after the cut-off</p>
                        <p className="text-sm text-muted">{model.cutoffLabel ?? 'The cut-off is not set yet.'}</p>
                    </section>
                )
                : (
                    <ul className="space-y-3">
                        {model.groups.map((group) => {
                            return (
                                <li key={group.teamName} className="rounded-2xl border border-line bg-surface p-3">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <h3 className="flex items-center gap-2 font-bold">
                                            <TeamCrest name={group.teamName} src={group.crestUrl} size={28} />
                                            {group.teamName}
                                            <span className="ml-2 rounded-full bg-gold px-2 py-0.5 text-xs text-on-gold">×{group.players.length}</span>
                                        </h3>
                                        {group.scoreLabel !== null ? <span className="text-sm font-semibold">{group.scoreLabel}</span> : null}
                                    </div>
                                    {group.fixtureLabel !== null ? <p className="text-xs text-muted">{group.fixtureLabel}</p> : null}
                                    <ul className="mt-2 flex flex-wrap gap-1.5">
                                        {group.players.map((player) => {
                                            return <PlayerChip key={player.name} player={player} />
                                        })}
                                    </ul>
                                </li>
                            )
                        })}
                    </ul>
                )}
        </div>
    )
}

function PlayerChip({ player }: { readonly player: RevealedPlayer }) {
    const mark = player.reinstated ? '↺' : player.outcome === 'through' ? '✓' : player.outcome === 'out' ? '✗' : ''
    const tone = player.outcome === 'out' && !player.reinstated
        ? 'border-line bg-subtle text-muted line-through'
        : player.outcome === 'through'
            ? 'border-gold bg-surface text-ink'
            : 'border-line bg-surface text-ink'
    const notes = [player.auto ? 'Auto' : null, player.override ? 'Organiser' : null].filter((note) => {
        return note !== null
    })

    return (
        <li className={`rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}>
            {mark === '' ? null : <span aria-hidden="true">{mark} </span>}
            {player.name}
            {notes.length > 0 ? <span className="ml-1 text-muted">({notes.join(', ')})</span> : null}
        </li>
    )
}

function WeekTabs({ current, links }: { readonly current: number; readonly links: PicksRevealProps['weekLinks'] }) {
    if (links.length <= 1) {
        return null
    }

    return (
        <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1">
            {links.map((link) => {
                const isCurrent = link.weekNumber === current
                return (
                    <Link
                        key={link.weekNumber}
                        href={link.href}
                        aria-current={isCurrent ? 'page' : undefined}
                        className={`shrink-0 rounded-full border px-3 py-1 text-sm font-semibold ${
                            isCurrent ? 'border-maroon bg-maroon text-on-maroon' : 'border-line bg-surface text-ink'
                        }`}
                    >
                        W{link.weekNumber}
                    </Link>
                )
            })}
        </nav>
    )
}
