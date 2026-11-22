// Created by Claude driven by Eddie Long on 2026-10-31.
//
// The pick screen. Tap a team to pick it. Tap another to change. No dialog.
// The tap shows at once (optimistic), then the server confirms.

'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useOptimistic, useState, useTransition } from 'react'
import type { ReactNode } from 'react'

import { SubmitButton } from '@/components/SubmitButton'
import type { FixtureDay, FixtureOption, HistoryItem, PickResult, PickScreenModel, TeamOption } from '@/view-models/pick-screen'

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
    const router = useRouter()

    // A page left open must not keep offering picks that closed while it sat there. At the
    // cut-off, and whenever the tab comes back into view, ask the server for the real state.
    const refresh = useCallback(() => {
        router.refresh()
    }, [router])
    useEffect(() => {
        if (model.status !== 'open') {
            return
        }

        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                refresh()
            }
        }
        document.addEventListener('visibilitychange', onVisible)
        return () => {
            document.removeEventListener('visibilitychange', onVisible)
        }
    }, [model.status, refresh])

    useEffect(() => {
        if (toast === null) {
            return
        }

        // A message that says a pick did not save stays a little longer.
        const timer = setTimeout(() => {
            setToast(null)
        }, toast.kind === 'error' ? 4500 : 2200)
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
            try {
                const result = await pickAction(team.id)
                setToast(result.ok
                    ? { id: Date.now(), kind: 'saved', text: `Saved ✓ ${result.teamName}` }
                    : { id: Date.now(), kind: 'error', text: result.message })
            } catch (error) {
                // No signal, or the server did not answer. The tap is undone, so say so.
                console.error('The pick did not save:', error)
                setToast({ id: Date.now(), kind: 'error', text: 'No signal. Your pick did not save. Try again.' })
            }
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
                onCutoff={refresh}
                belowWeek={<PickRow model={model} />}
            />

            {model.buybackAvailable && buybackAction !== undefined
                ? <BuybackBanner action={buybackAction} feeLabel={buybackFeeLabel} />
                : null}

            <StatusPanel model={model} />

            {model.fixtures.length > 0 && model.status !== 'out'
                ? (
                    <ul className="space-y-3">
                        {model.days.map((day) => {
                            return (
                                <DayGroup
                                    key={day.key}
                                    day={day}
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
                        Games moved this week: {model.postponedLabels.join(', ')}. You can’t pick those teams.
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

/**
 * The player's pick, directly under the week heading, in one or two short lines. This
 * replaces the separate “Your pick” panel and keeps the screen short. A player who is out,
 * waiting, or past the end has no pick to show, so a panel explains instead (StatusPanel).
 */
function PickRow({ model }: { readonly model: PickScreenModel }) {
    const pick = model.currentPick
    const hasTeam = pick !== null && pick.teamId !== null

    switch (model.status) {
        case 'open':
            if (model.needsRepick) {
                const orWePick = model.fallbackTeamName === null ? '' : `, or we pick ${model.fallbackTeamName}`
                return <span className="block font-semibold">Your game was moved. Pick again{orWePick}.</span>
            }

            return hasTeam
                ? <YourPick pick={pick} />
                : (
                    <span className="block">
                        No pick yet. Tap a team below.
                        {model.fallbackTeamName === null ? '' : ` If you do nothing, we pick ${model.fallbackTeamName}.`}
                    </span>
                )
        case 'locked':
            return (
                <span className="flex flex-wrap items-center gap-x-2">
                    <span className="mr-1 font-semibold">Picks closed ·</span>
                    {hasTeam ? <YourPick pick={pick} /> : <span>We are picking a team for you.</span>}
                </span>
            )
        default:
            return null
    }
}

function YourPick({ pick }: { readonly pick: NonNullable<PickScreenModel['currentPick']> }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span>Your pick:</span>
            <TeamCrest name={pick.teamName} src={pick.crestUrl} size={20} />
            <span className="font-bold">{pick.teamName}{pick.auto ? ' (Auto)' : ''}</span>
        </span>
    )
}

/** Explains the situations where there is no pick to show. For an open or closed week the pick is in the banner. */
function StatusPanel({ model }: { readonly model: PickScreenModel }) {
    switch (model.status) {
        case 'open':
        case 'locked':
            return null
        case 'waitingForResult':
            return (
                <Panel title="Waiting for last week to finish">
                    You can pick once everyone’s result from last week is in.
                </Panel>
            )
        case 'out':
            return (
                <Panel title="You’re out">
                    {model.outCause === null ? null : <span className="block">{model.outCause}</span>}
                    <span className="block">
                        Thanks for playing and for helping Tramore Athletic. You can still see the standings.
                    </span>
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

/** One box for a day: the date once at the top, then every game played on it. */
function DayGroup({ day, selectedTeamId, isLocked, onChoose }: {
    readonly day: FixtureDay
    readonly selectedTeamId: string | null
    readonly isLocked: boolean
    readonly onChoose: (team: TeamOption) => void
}) {
    return (
        <li className="overflow-hidden rounded-2xl border border-line bg-surface">
            <h3 className="bg-subtle px-3 py-2 text-base font-bold">{day.label}</h3>
            <ul className="divide-y divide-line">
                {day.fixtures.map((fixture) => {
                    return (
                        <FixtureRow
                            key={fixture.id}
                            fixture={fixture}
                            selectedTeamId={selectedTeamId}
                            isLocked={isLocked}
                            onChoose={onChoose}
                        />
                    )
                })}
            </ul>
        </li>
    )
}

function FixtureRow({ fixture, selectedTeamId, isLocked, onChoose }: {
    readonly fixture: FixtureOption
    readonly selectedTeamId: string | null
    readonly isLocked: boolean
    readonly onChoose: (team: TeamOption) => void
}) {
    return (
        <li className="p-2">
            <div className="flex items-center justify-between px-1 pb-1.5">
                <span className="text-sm font-bold tabular-nums">{fixture.timeLabel}</span>
                <span className="flex items-center gap-2">
                    {fixture.scoreLabel !== null ? <span className="text-sm font-semibold text-ink">{fixture.scoreLabel}</span> : null}
                    <PickResultBadge result={fixture.pickResult} />
                </span>
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

/** How the player’s own pick fared, on the game that holds it. The words come from the model. */
function PickResultBadge({ result }: { readonly result: PickResult | null }) {
    if (result === null) {
        return null
    }

    const style = {
        through: 'bg-gold font-bold text-on-gold',
        out: 'bg-maroon font-bold text-on-maroon',
        staysIn: 'border border-gold bg-subtle font-bold text-ink',
        waiting: 'bg-subtle font-semibold text-muted',
    }[result.kind]

    return <span className={`rounded-full px-2 py-0.5 text-right text-xs ${style}`}>{result.text}</span>
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
                Pay {feeLabel} to get back in. Do it before the Week 2 cut-off. Your Week 1 team stays used.
            </p>
            <SubmitButton
                pendingLabel="Opening payment…"
                className="mt-2 min-h-11 rounded-xl bg-maroon px-4 font-semibold text-on-maroon"
            >
                Buy back in for {feeLabel}
            </SubmitButton>
        </form>
    )
}
