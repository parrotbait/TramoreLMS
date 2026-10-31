// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Week-by-week standings grid. One row per player, one crest per week.
// The cell where a player went out is tinted. Everything else is in the
// details line: tap or hover a crest.
//
// Crests keep columns narrow, so a whole season fits a laptop screen. On a
// phone the names stay pinned and the grid opens on the latest week.

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import type { EntryId, Verdict } from '@/engine'
import type {
    ProgressionCell,
    ProgressionModel,
    ProgressionRow,
    ProgressionWeek,
} from '@/view-models/progression'

import { TeamCrest } from './TeamCrest'

type Filter =
    | 'everyone'
    | 'stillIn'

interface Selection {
    readonly row: ProgressionRow
    readonly week: ProgressionWeek
    readonly cell: ProgressionCell
}

interface ProgressionGridProps {
    readonly model: ProgressionModel
    /** The signed-in player's entry, highlighted so they can find themselves. */
    readonly highlightEntryId?: EntryId
}

export function ProgressionGrid({ model, highlightEntryId }: ProgressionGridProps) {
    const scroller = useRef<HTMLDivElement>(null)
    const [filter, setFilter] = useState<Filter>('everyone')
    const [query, setQuery] = useState('')
    const [selection, setSelection] = useState<Selection | null>(null)

    useEffect(() => {
        const element = scroller.current
        if (element !== null) {
            element.scrollLeft = element.scrollWidth
        }
    }, [model.weeks.length])

    const sections = useMemo(() => {
        const needle = normalise(query)
        return model.sections
            .filter((section) => {
                return filter === 'everyone' || section.isStillIn
            })
            .map((section) => {
                return {
                    ...section,
                    rows: section.rows.filter((row) => {
                        return needle === '' || normalise(row.name).includes(needle)
                    }),
                }
            })
            .filter((section) => {
                return section.rows.length > 0
            })
    }, [model.sections, filter, query])

    const stillInCount = model.sections.find((section) => {
        return section.isStillIn
    })?.rows.length ?? 0

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <div role="group" aria-label="Show" className="inline-flex rounded-xl border border-line bg-subtle p-0.5">
                    <FilterButton
                        isActive={filter === 'everyone'}
                        onClick={() => {
                            setFilter('everyone')
                        }}
                    >
                        Everyone ({model.totalEntries})
                    </FilterButton>
                    <FilterButton
                        isActive={filter === 'stillIn'}
                        onClick={() => {
                            setFilter('stillIn')
                        }}
                    >
                        Still in ({stillInCount})
                    </FilterButton>
                </div>
                <input
                    type="search"
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value)
                    }}
                    placeholder="Find a player"
                    aria-label="Find a player"
                    className="min-h-9 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm"
                />
            </div>

            <div ref={scroller} className="max-h-[70vh] overflow-auto rounded-2xl border border-line bg-surface">
                <table className="border-separate border-spacing-0 text-sm">
                    <thead>
                        <tr>
                            <th
                                scope="col"
                                className="sticky left-0 top-0 z-30 min-w-28 border-b border-line bg-surface px-3 py-2 text-left text-xs font-semibold text-muted"
                            >
                                Player
                            </th>
                            {model.weeks.map((week) => {
                                return (
                                    <th
                                        key={week.number}
                                        scope="col"
                                        title={`Week ${week.number}, PL Matchday ${week.plMatchday}`}
                                        className="sticky top-0 z-20 w-10 border-b border-line bg-surface px-0.5 py-2 text-center"
                                    >
                                        <span className="block text-xs font-bold">W{week.number}</span>
                                        <span className="block text-[11px] tabular-nums text-muted">
                                            {week.survivorsAfter ?? '·'}
                                        </span>
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>
                    {sections.map((section) => {
                        const showTitle = sections.length > 1 || !section.isStillIn
                        return (
                            <tbody key={section.key}>
                                {showTitle
                                    ? (
                                        <tr>
                                            <th colSpan={model.weeks.length + 1} scope="colgroup" className="bg-subtle p-0 text-left">
                                                <span className="sticky left-0 block px-3 py-1 text-xs font-semibold text-muted">
                                                    {section.title}
                                                </span>
                                            </th>
                                        </tr>
                                    )
                                    : null}
                                {section.rows.map((row) => {
                                    return (
                                        <PlayerRow
                                            key={row.entryId}
                                            row={row}
                                            weeks={model.weeks}
                                            isHighlighted={row.entryId === highlightEntryId}
                                            selection={selection}
                                            onSelect={setSelection}
                                        />
                                    )
                                })}
                            </tbody>
                        )
                    })}
                </table>
                {sections.length === 0
                    ? <p className="px-3 py-6 text-center text-sm text-muted">No players match “{query}”.</p>
                    : null}
            </div>

            <p aria-live="polite" className="min-h-10 rounded-xl bg-subtle px-3 py-2 text-sm">
                {selection === null
                    ? <span className="text-muted">Tap a crest for the details.</span>
                    : describe(selection.row, selection.week, selection.cell)}
            </p>

            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="inline-block h-3 w-3 rounded bg-maroon/10 ring-1 ring-maroon/40" />
                    Went out
                </span>
                <span><strong className="text-ink">*</strong> Auto-assigned</span>
                <span>Numbers under each week: players still in</span>
            </p>
        </div>
    )
}

function FilterButton({ isActive, onClick, children }: {
    readonly isActive: boolean
    readonly onClick: () => void
    readonly children: ReactNode
}) {
    return (
        <button
            type="button"
            aria-pressed={isActive}
            onClick={onClick}
            className={`min-h-8 rounded-lg px-3 text-xs font-semibold ${isActive ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
        >
            {children}
        </button>
    )
}

function PlayerRow({ row, weeks, isHighlighted, selection, onSelect }: {
    readonly row: ProgressionRow
    readonly weeks: readonly ProgressionWeek[]
    readonly isHighlighted: boolean
    readonly selection: Selection | null
    readonly onSelect: (selection: Selection) => void
}) {
    const nameClass = isHighlighted
        ? 'bg-subtle font-bold shadow-[inset_4px_0_0_var(--colour-gold)]'
        : 'bg-surface font-medium'

    return (
        <tr className={isHighlighted ? 'bg-subtle' : undefined}>
            <th scope="row" className={`sticky left-0 z-10 max-w-36 truncate px-3 text-left ${nameClass}`}>
                {row.isWinner ? '🏆 ' : ''}
                {row.name}
            </th>
            {row.cells.map((cell, index) => {
                const week = weeks[index]
                if (week === undefined) {
                    return null
                }

                return (
                    <td key={week.number} className="p-0.5">
                        <Cell
                            cell={cell}
                            label={describe(row, week, cell)}
                            isSelected={isSelectedCell(selection, row, week)}
                            onSelect={() => {
                                onSelect({ row, week, cell })
                            }}
                        />
                    </td>
                )
            })}
        </tr>
    )
}

function Cell({ cell, label, isSelected, onSelect }: {
    readonly cell: ProgressionCell
    readonly label: string
    readonly isSelected: boolean
    readonly onSelect: () => void
}) {
    switch (cell.kind) {
        case 'empty':
            return <span className="block h-9 w-9" aria-hidden="true" />
        case 'hidden':
            return <span title={label} aria-label={label} className="block h-9 w-9 rounded-lg border border-dashed border-line" />
        case 'noPick':
        case 'pick':
            break
    }

    const isOut = cell.outcome === 'out' && !(cell.kind === 'pick' && cell.reinstated)
    const tone = isOut
        ? 'bg-maroon/10 ring-1 ring-maroon/40'
        : cell.outcome === 'pending'
            ? 'border border-dashed border-line'
            : ''
    const selected = isSelected ? 'outline-2 outline-maroon' : ''
    const isPass = cell.kind === 'pick' && cell.teamName === 'Pass'

    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            onClick={onSelect}
            onMouseEnter={onSelect}
            onFocus={onSelect}
            className={`relative flex h-9 w-9 items-center justify-center rounded-lg ${tone} ${selected}`}
        >
            {cell.kind === 'pick' && !isPass
                ? <TeamCrest name={cell.teamName} src={cell.crestUrl} size={24} />
                : <span className="text-[10px] font-semibold text-muted">{isPass ? 'Pass' : '—'}</span>}
            {cell.kind === 'pick' && cell.auto
                ? <span aria-hidden="true" className="absolute right-0.5 top-0 text-xs font-bold leading-none text-ink">*</span>
                : null}
        </button>
    )
}

function isSelectedCell(selection: Selection | null, row: ProgressionRow, week: ProgressionWeek): boolean {
    if (selection === null) {
        return false
    }

    return selection.row.entryId === row.entryId && selection.week.number === week.number
}

function describe(row: ProgressionRow, week: ProgressionWeek, cell: ProgressionCell): string {
    const prefix = `${row.name} · Week ${week.number} (PL Matchday ${week.plMatchday})`

    switch (cell.kind) {
        case 'empty':
            return `${prefix} · out by then`
        case 'hidden':
            return `${prefix} · picks are hidden until the cut-off`
        case 'noPick':
            return `${prefix} · no pick · ${outcomeText(cell.outcome)} (admin decision)`
        case 'pick':
            break
    }

    const team = cell.matchLabel === null ? cell.teamName : `${cell.teamName} (${cell.matchLabel})`
    const parts = [prefix, team, cell.reinstated ? 'Everyone went out, so all stayed in' : outcomeText(cell.outcome)]

    if (cell.auto) {
        parts.push('Auto-assigned')
    }

    if (cell.override) {
        parts.push('Admin decision')
    }

    if (cell.boughtBack) {
        parts.push('Bought back in')
    }

    return parts.join(' · ')
}

function outcomeText(outcome: Verdict | 'pending'): string {
    switch (outcome) {
        case 'through':
            return 'Through'
        case 'out':
            return 'Out'
        case 'pending':
            return 'Waiting for the result'
    }
}

/** Case- and accent-insensitive, so “sean” finds “Seán”. */
function normalise(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
}
