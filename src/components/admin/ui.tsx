// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Small building blocks for the admin pages. Plain and dense: the admin area
// is a working tool, used mostly on a laptop.

import type { ReactNode } from 'react'

export function Card({ title, children, actions }: {
    readonly title: string
    readonly children: ReactNode
    readonly actions?: ReactNode
}) {
    return (
        <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold">{title}</h2>
                {actions}
            </div>
            {children}
        </section>
    )
}

export function Stat({ label, value, detail }: {
    readonly label: string
    readonly value: string
    readonly detail?: string
}) {
    return (
        <div className="rounded-xl bg-subtle px-3 py-2">
            <p className="text-xs text-muted">{label}</p>
            <p className="text-lg font-bold tabular-nums">{value}</p>
            {detail === undefined ? null : <p className="text-xs text-muted">{detail}</p>}
        </div>
    )
}

export function Field({ label, name, defaultValue, placeholder, type = 'text', required = false, hint }: {
    readonly label: string
    readonly name: string
    readonly defaultValue?: string | undefined
    readonly placeholder?: string
    readonly type?: string
    readonly required?: boolean
    readonly hint?: string
}) {
    return (
        <label className="block space-y-1 text-sm">
            <span className="font-semibold">{label}</span>
            <input
                name={name}
                type={type}
                defaultValue={defaultValue}
                placeholder={placeholder}
                required={required}
                className="min-h-10 w-full rounded-lg border border-line px-2"
            />
            {hint === undefined ? null : <span className="block text-xs text-muted">{hint}</span>}
        </label>
    )
}

export function ReasonField() {
    return <Field label="Reason (saved in the audit log)" name="reason" required placeholder="For example: feed showed the wrong score" />
}

export function MethodField() {
    return (
        <label className="block space-y-1 text-sm">
            <span className="font-semibold">Paid by</span>
            <select name="method" required defaultValue="cash" className="min-h-10 w-full rounded-lg border border-line px-2">
                <option value="cash">Cash</option>
                <option value="revolut">Revolut</option>
                <option value="other">Other</option>
            </select>
        </label>
    )
}

export function Submit({ children, tone = 'primary' }: { readonly children: ReactNode; readonly tone?: 'primary' | 'plain' | 'danger' }) {
    const toneClass = tone === 'primary'
        ? 'bg-maroon text-on-maroon'
        : tone === 'danger'
            ? 'border-2 border-maroon bg-surface text-maroon'
            : 'border border-line bg-surface text-ink'

    return (
        <button type="submit" className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${toneClass}`}>
            {children}
        </button>
    )
}

/** A disclosure for actions that change things, so they are not one tap away. */
export function ActionPanel({ label, children }: { readonly label: string; readonly children: ReactNode }) {
    return (
        <details className="rounded-lg border border-line bg-surface">
            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">{label}</summary>
            <div className="space-y-2 border-t border-line px-3 py-3">{children}</div>
        </details>
    )
}
