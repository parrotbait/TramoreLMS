// Created by Claude driven by Eddie Long on 2026-11-03.
//
// Switches between paid entries on one email, for example a parent playing
// alongside a child. Shown only when there is more than one.

'use client'

import { useRef } from 'react'

import type { MyEntry } from '@/entries/gate'

interface EntrySwitcherProps {
    readonly entries: readonly MyEntry[]
    readonly selectedId: string
    readonly action: (formData: FormData) => Promise<void>
}

export function EntrySwitcher({ entries, selectedId, action }: EntrySwitcherProps) {
    const form = useRef<HTMLFormElement>(null)
    if (entries.length < 2) {
        return null
    }

    return (
        <form ref={form} action={action} className="mx-auto flex max-w-md items-center gap-2 px-4 pb-2 text-sm text-on-maroon">
            <label htmlFor="entry-switcher" className="shrink-0">Playing as</label>
            <select
                id="entry-switcher"
                name="entryId"
                defaultValue={selectedId}
                onChange={() => {
                    form.current?.requestSubmit()
                }}
                className="min-h-9 flex-1 rounded-lg bg-surface px-2 font-semibold text-ink"
            >
                {entries.map((entry) => {
                    return <option key={entry.entryId} value={entry.entryId}>{entry.displayName}</option>
                })}
            </select>
            <noscript>
                <button type="submit" className="rounded-lg bg-gold px-2 py-1 font-semibold text-on-gold">Switch</button>
            </noscript>
        </form>
    )
}
