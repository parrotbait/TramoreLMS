// Created by Claude driven by Eddie Long on 2026-10-31.
//
// The pick screen. Tap a team to pick it. Tap another to change. No dialog.
// The tap shows at once (optimistic), then the server confirms.

'use client'

import { useEffect, useOptimistic, useState, useTransition } from 'react'
import type { ReactNode } from 'react'

import type { FixtureOption, HistoryItem, PickScreenModel, TeamOption } from '@/view-models/pick-screen'

import { TeamCrest } from './TeamCrest'
import { WeekBanner } from './WeekBanner'

export type PickActionResult =
    | { readonly ok: true; readonly teamName: string }
    | { readonly ok: false; readonly message: string }

interface PickScreenProps {
    readonly model: PickScreenModel
    readonly pickAction: (teamId: string) => Promise<PickActionResult>
    readonly buybackAction?: () => Promise<void>
    readonly buybackFeeLabel: string
}

interface Toast {
    readonly id: number
    readonly kind: 'saved' | 'error'
    readonly text: string
}

export function PickScreen({ model, pickAction, buybackAction, buybackFeeLabel }: PickScreenProps) {
    const [optimisticTeamId, setOptimisticTeamId] = useOptimistic(model.currentPick?.teamId ?? null)
    const [, startTransition] = useTransition()
    const [toast, setToast] = useState<Toast | null>(null)

    useEffect(() => {
        if (toast === null) {
            return
        }

        const timer = setTimeout(() => {
            setToast(null)
        }, 2200)
        return () => {
            clearTimeout(timer)
        }
    }, [toast])

    const choose = (team: TeamOption) => {
        if (team.state !== 'available' || team.id === optimisticTeamId) {
            return
        }

        startTransition(async () => {
            setOptimisticTeamId(team.id)
            const result = await pickAction(team.id)
            setToast(result.ok
                ? { id: Date.now(), kind: 'saved', text: `Saved ✓ ${result.teamName}` }
                : { id: Date.now(), kind: 'error', text: result.message })
        })
    }

    return (
        <div className="space-y-4">
            <WeekBanner
                weekNumber={model.weekNumber}
                plMatchday={model.plMatchday}
                cutoffLabel={model.cutoffLabel}
                cutoffIso={model.cutoffIso}
                nowIso={model.nowIso}
            />

            {model.buybackAvailable && buybackAction !== undefined
                ? <BuybackBanner action={buybackAction} feeLabel={buybackFeeLabel} />
                : null}

            <StatusPanel model={model} />

            {model.fixtures.length > 0 && model.status !== 'out'
                ? (
                    <ul className="space-y-2">
                        {model.fixtures.map((fixture) => {
                            return (
                                <FixtureRow
                                    key={fixture.id}
                                    fixture={fixture}
                                    selectedTeamId={optimisticTeamId}
                                    isLocked={model.status !== 'open'}
                                    onChoose={choose}
                                />
                            )
                        })}
                    </ul>
                )
                : null}

            {model.postponedLabels.length > 0
                ? (
                    <p className="text-sm text-muted">
                        Postponed this week: {model.postponedLabels.join(', ')}. Those teams can’t be picked.
                    </p>
                )
                : null}

            <History items={model.history} />

            {toast !== null
                ? (
                    <div
                        key={toast.id}
                        role="status"
                        className={`fixed inset-x-0 bottom-6 mx-auto w-fit max-w-[90%] rounded-full px-5 py-3 text-sm font-semibold shadow-lg ${
                            toast.kind === 'saved' ? 'bg-gold text-on-gold' : 'bg-maroon text-on-maroon'
                        }`}
                    >
                        {toast.text}
                    </div>
                )
                : null}
        </div>
    )
}

function StatusPanel({ model }: { readonly model: PickScreenModel }) {
    const pick = model.currentPick
    const pickLine = pick === null ? null : `${pick.teamName}${pick.auto ? ' (Auto)' : ''}`
    const crest = pick === null ? undefined : { name: pick.teamName, src: pick.crestUrl }

    switch (model.status) {
        case 'open':
            if (model.needsRepick) {
                return (
                    <Panel tone="warning" title="Your match was postponed">
                        Pick again before the cut-off. If you don’t, you’ll get the first available team
                        in alphabetical order.
                    </Panel>
                )
            }

            return pick === null
                ? <Panel title={`Pick a team for Week ${model.weekNumber}`}>Tap a team below. You can change it as often as you like until the cut-off.</Panel>
                : (
                    <Panel title={`Your pick: ${pickLine ?? ''}`} crest={crest}>
                        Tap another team to change it before the cut-off.
                    </Panel>
                )
        case 'locked':
            return (
                <Panel title="Picks are locked" crest={crest}>
                    {pickLine === null ? 'Your pick is being assigned.' : `Your pick: ${pickLine}.`} Everyone’s picks are now visible.
                </Panel>
            )
        case 'waitingForResult':
            return (
                <Panel title="Waiting on last week’s result">
                    You can pick as soon as your result from last week is in.
                </Panel>
            )
        case 'out':
            return (
                <Panel title="You’re out">
                    Thanks for playing, and for supporting Tramore Athletic. You can still follow the standings.
                </Panel>
            )
        case 'won':
            return <Panel tone="success" title="🏆 You’ve won!">The organiser will be in touch about the prize.</Panel>
        case 'competitionOver':
            return <Panel title="The competition is over">Thanks for taking part.</Panel>
        case 'weekNotOpen':
            return <Panel title="Not open yet">Picks for this week open soon.</Panel>
    }
}

function Panel({ title, children, tone = 'plain', crest }: {
    readonly title: string
    readonly children: ReactNode
    readonly tone?: 'plain' | 'warning' | 'success'
    readonly crest?: { readonly name: string; readonly src: string | null } | undefined
}) {
    const toneClass = tone === 'warning'
        ? 'border-maroon bg-subtle'
        : tone === 'success'
            ? 'border-gold bg-subtle'
            : 'border-line bg-surface'

    return (
        <section className={`rounded-2xl border-2 px-4 py-3 ${toneClass}`}>
            <h3 className="flex items-center gap-2 font-bold">
                {crest === undefined ? null : <TeamCrest name={crest.name} src={crest.src} size={28} />}
                {title}
            </h3>
            <p className="mt-0.5 text-sm text-muted">{children}</p>
        </section>
    )
}

function FixtureRow({ fixture, selectedTeamId, isLocked, onChoose }: {
    readonly fixture: FixtureOption
    readonly selectedTeamId: string | null
    readonly isLocked: boolean
    readonly onChoose: (team: TeamOption) => void
}) {
    return (
        <li className="rounded-2xl border border-line bg-surface p-2">
            <div className="flex items-center justify-between px-1 pb-1.5 text-xs text-muted">
                <span>{fixture.kickoffLabel}</span>
                {fixture.scoreLabel !== null ? <span className="font-semibold text-ink">{fixture.scoreLabel}</span> : null}
            </div>
            <div className="flex items-stretch gap-2">
                <TeamButton
                    team={fixture.home}
                    isSelected={fixture.home.id === selectedTeamId}
                    isLocked={isLocked}
                    onChoose={onChoose}
                />
                <span className="self-center text-xs font-semibold text-muted">v</span>
                <TeamButton
                    team={fixture.away}
                    isSelected={fixture.away.id === selectedTeamId}
                    isLocked={isLocked}
                    onChoose={onChoose}
                />
            </div>
        </li>
    )
}

function TeamButton({ team, isSelected, isLocked, onChoose }: {
    readonly team: TeamOption
    readonly isSelected: boolean
    readonly isLocked: boolean
    readonly onChoose: (team: TeamOption) => void
}) {
    const isUsed = team.state === 'used'
    const isDisabled = team.state !== 'available' || isLocked
    const stateClass = isSelected
        ? 'border-maroon bg-maroon text-on-maroon'
        : isUsed
            ? 'border-line bg-subtle text-muted'
            : isDisabled
                ? 'border-line bg-surface text-ink'
                : 'border-line bg-surface text-ink hover:border-maroon active:scale-[0.98]'

    return (
        <button
            type="button"
            disabled={isDisabled && !isSelected}
            aria-pressed={isSelected}
            onClick={() => {
                onChoose(team)
            }}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center rounded-xl border-2 px-2 py-2 text-center text-sm font-semibold transition ${stateClass}`}
        >
            <TeamCrest name={team.name} src={team.crestUrl} size={32} />
            <span className={`mt-1 ${isUsed ? 'line-through' : ''}`}>
                {isSelected ? '✓ ' : ''}
                {team.name}
            </span>
            {isUsed && team.usedInWeek !== null
                ? <span className="text-xs font-normal">Used in Week {team.usedInWeek}</span>
                : null}
        </button>
    )
}

function History({ items }: { readonly items: readonly HistoryItem[] }) {
    if (items.length === 0) {
        return null
    }

    return (
        <section>
            <h3 className="mb-2 text-sm font-bold">Your picks so far</h3>
            <ol className="flex flex-wrap gap-2">
                {items.map((item) => {
                    const mark = item.reinstated ? '↺' : item.outcome === 'through' ? '✓' : item.outcome === 'out' ? '✗' : '…'
                    const tone = item.outcome === 'out' && !item.reinstated ? 'text-muted line-through' : 'text-ink'
                    return (
                        <li
                            key={item.week}
                            className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-subtle px-3 py-1 text-xs ${tone}`}
                        >
                            <span className="font-semibold">W{item.week}</span>
                            <TeamCrest name={item.teamName} src={item.crestUrl} size={16} />
                            {item.teamName}
                            {item.auto ? ' (Auto)' : ''} {mark}
                        </li>
                    )
                })}
            </ol>
        </section>
    )
}

function BuybackBanner({ action, feeLabel }: { readonly action: () => Promise<void>; readonly feeLabel: string }) {
    return (
        <form action={action} className="rounded-2xl border-2 border-gold bg-subtle px-4 py-3">
            <h3 className="font-bold">Out in Week 1? Buy back in.</h3>
            <p className="mt-0.5 text-sm text-muted">
                Re-enter for {feeLabel} before the Week 2 cut-off. Your Week 1 team stays used.
            </p>
            <button type="submit" className="mt-2 min-h-11 rounded-xl bg-maroon px-4 font-semibold text-on-maroon">
                Buy back in for {feeLabel}
            </button>
        </form>
    )
}
