// Created by Claude driven by Eddie Long on 2026-10-31.
//
// The preview's control bar: shows the simulated time and moves it on.

import { formatDublin } from '@/lib/format'
import { finalWeekOf, getPreview } from '@/preview/store'
import type { PreviewPhase } from '@/preview/store'

import { previewAdvance, previewPlayToEnd, previewPostpone, previewReset } from './actions'

const PHASE_LABELS: Readonly<Record<PreviewPhase, string>> = {
    picking: 'Picking',
    finalHours: 'Final hours before the cut-off',
    locked: 'Locked: matches being played',
    settled: 'Results are in',
}

export async function PreviewBar() {
    const session = await getPreview()
    const isRunning = session.competition.standings(session.now).outcome.kind === 'running'
    const canOpenNextWeek = isRunning && session.timeline.weekNumber < finalWeekOf()
    const nextStep = nextStepLabel(session.phase, canOpenNextWeek)
    const canPostpone = session.phase === 'picking' || session.phase === 'finalHours'

    return (
        <aside className="border-b border-line bg-subtle">
            <div className="mx-auto max-w-md px-4 py-2 text-xs">
                <p>
                    <strong>Preview</strong> · simulated time <strong>{formatDublin(session.now)}</strong>
                </p>
                <p className="text-muted">
                    Week {session.timeline.weekNumber} · {PHASE_LABELS[session.phase]} · seed {session.seed}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {nextStep !== null
                        ? <ToolbarButton action={previewAdvance} label={nextStep} primary />
                        : null}
                    {canPostpone ? <ToolbarButton action={previewPostpone} label="Postpone a match" /> : null}
                    {isRunning ? <ToolbarButton action={previewPlayToEnd} label="Play to the end" /> : null}
                    <ToolbarButton action={previewReset} label="New season" />
                </div>
            </div>
        </aside>
    )
}

function nextStepLabel(phase: PreviewPhase, canOpenNextWeek: boolean): string | null {
    switch (phase) {
        case 'picking':
            return '⏩ 3 hours to the cut-off'
        case 'finalHours':
            return '🔒 Pass the cut-off'
        case 'locked':
            return '⚽ Play the matches'
        case 'settled':
            return canOpenNextWeek ? '📅 Open next week' : null
    }
}

function ToolbarButton({ action, label, primary = false }: {
    readonly action: () => Promise<void>
    readonly label: string
    readonly primary?: boolean
}) {
    return (
        <form action={action}>
            <button
                type="submit"
                className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${
                    primary ? 'bg-maroon text-on-maroon' : 'border border-line bg-surface text-ink'
                }`}
            >
                {label}
            </button>
        </form>
    )
}
