// Created by Claude driven by Eddie Long on 2026-11-04.
//
// The rules (PLAN.md section 2), with this competition's fee, prize and
// team order filled in. Public.

import type { Metadata } from 'next'

import { loadPublicCompetition } from '@/content/load'
import { rulesContent } from '@/content/rules'
import { getDatabase } from '@/db/client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Rules · Last Man Standing',
}

export default async function RulesPage() {
    const competition = await loadPublicCompetition(getDatabase(), new Date()).catch(() => {
        return null
    })
    const rules = rulesContent({
        buybackFeeCents: competition?.buybackFeeCents ?? null,
        prizeCents: competition?.prizeCents ?? null,
        teamNames: competition?.teamNames ?? [],
    })

    return (
        <>
            <h1 className="text-2xl font-bold">Rules</h1>
            <ol className="space-y-5">
                {rules.sections.map((section, index) => {
                    return (
                        <li key={section.title} className="space-y-1">
                            <h2 className="text-lg font-bold">
                                {index + 1}. {section.title}
                            </h2>
                            {section.lines.map((line) => {
                                return <p key={line}>{line}</p>
                            })}
                        </li>
                    )
                })}
            </ol>

            {rules.teamOrder.length === 0
                ? null
                : (
                    <section className="space-y-2 rounded-2xl border border-line bg-subtle p-4">
                        <h2 className="text-lg font-bold">The order we pick in</h2>
                        <p className="text-sm text-muted">If we pick for you, we go down this list.</p>
                        <ol className="list-decimal space-y-0.5 pl-6">
                            {rules.teamOrder.map((name) => {
                                return <li key={name}>{name}</li>
                            })}
                        </ol>
                    </section>
                )}

            <p className="font-semibold">{rules.closing}</p>
        </>
    )
}
