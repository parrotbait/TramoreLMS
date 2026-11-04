// Created by Claude driven by Eddie Long on 2026-11-04.

import Link from 'next/link'

export function CompetitionNav({ competitionId, name, currentWeek }: {
    readonly competitionId: string
    readonly name: string
    readonly currentWeek: number | null
}) {
    const base = `/admin/c/${competitionId}`
    const links = [
        { href: base, label: 'Dashboard' },
        { href: `${base}/settings`, label: 'Settings' },
        { href: `${base}/entries`, label: 'Entries' },
        ...(currentWeek === null ? [] : [{ href: `${base}/weeks/${currentWeek}`, label: `Week ${currentWeek}` }]),
    ]

    return (
        <div className="space-y-2">
            <h1 className="text-2xl font-bold">{name}</h1>
            <nav className="flex flex-wrap gap-2 text-sm">
                {links.map((link) => {
                    return (
                        <Link key={link.href} href={link.href} className="rounded-lg border border-line bg-surface px-3 py-1.5 font-semibold">
                            {link.label}
                        </Link>
                    )
                })}
            </nav>
        </div>
    )
}
