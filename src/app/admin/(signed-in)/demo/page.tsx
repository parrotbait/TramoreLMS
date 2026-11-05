// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Runs the demo competition: start it, move it on, add guests, wipe it.
// See src/demo for how it works and what it never touches.

import Link from 'next/link'

import { Card, Field, Stat, Submit } from '@/components/admin/ui'
import { getDatabase } from '@/db/client'
import { addDemoGuestAction, nextDemoStepAction, startDemoAction, wipeDemoAction } from '@/demo/actions'
import { nextStepLabel } from '@/demo/plan'
import type { DemoStage } from '@/demo/plan'
import { demoStatus } from '@/demo/service'
import { formatDublin } from '@/lib/format'

export default async function DemoPage() {
    const status = await demoStatus(getDatabase())

    if (status === null) {
        return (
            <Card title="Demo">
                <p className="text-sm text-muted">
                    Show someone how it works with a pretend competition. It has 20 bot players and you.
                    It uses the real fixtures and rules. You move the clock on with one button.
                    No money is taken and no game emails are sent. Real players never see it.
                </p>
                <form action={startDemoAction} className="flex flex-wrap items-end gap-3">
                    <Field label="Your name in the demo" name="name" defaultValue="Organiser" required />
                    <Submit>Start a demo</Submit>
                </form>
            </Card>
        )
    }

    const { competition, now, stage } = status
    const label = nextStepLabel(stage)
    const base = `/admin/c/${competition.id}`

    return (
        <>
            <Card title="Demo">
                <div className="grid gap-2 sm:grid-cols-3">
                    <Stat label="Demo time" value={formatDublin(now)} />
                    <Stat label="Where it is" value={stageText(stage)} />
                    <Stat label="Weeks" value={`PL Matchday ${competition.startMatchday} to ${competition.finalMatchday}`} />
                </div>
                {label === null
                    ? <p className="text-sm font-semibold">The demo is over. Wipe it to start again.</p>
                    : (
                        <form action={nextDemoStepAction}>
                            <Submit>Next step: {label}</Submit>
                        </form>
                    )}
                <nav className="flex flex-wrap gap-3 text-sm">
                    <Link href="/pick" className="font-semibold text-maroon underline">Your pick screen</Link>
                    <Link href="/standings" className="font-semibold text-maroon underline">Standings</Link>
                    <Link href={base} className="font-semibold text-maroon underline">Demo dashboard</Link>
                    <Link href={`${base}/share`} className="font-semibold text-maroon underline">Share images</Link>
                </nav>
                <p className="text-xs text-muted">
                    “Go to 3 hours before the cut-off” sends the real reminder email to you and any guest
                    who hasn’t picked. Bots are never emailed.
                </p>
                <p className="text-xs text-muted">
                    To steer the story, change a result on the demo’s Week page before you play the games.
                    If you also have a real entry, use “Playing as” to switch to the demo.
                </p>
            </Card>

            <Card title="Add a guest">
                <p className="text-sm text-muted">
                    Someone who plays along on their own phone. We email them a link to play. It works for 24 hours.
                    After that, they sign in at /signin with this email. Wiping the demo removes their demo entry,
                    never a real one.
                </p>
                <form action={addDemoGuestAction} className="grid gap-3 sm:grid-cols-3">
                    <Field label="Name" name="name" required />
                    <Field label="Email" name="email" type="email" required />
                    <div className="flex items-end">
                        <Submit tone="plain">Add guest</Submit>
                    </div>
                </form>
            </Card>

            <Card title="Wipe the demo">
                <p className="text-sm text-muted">
                    Deletes the demo, its bots and every demo entry.
                    Guests with nothing else on the site are deleted too. Real competitions are not touched.
                </p>
                <form action={wipeDemoAction}>
                    <Submit tone="danger">Wipe the demo</Submit>
                </form>
            </Card>
        </>
    )
}

function stageText(stage: DemoStage): string {
    switch (stage.kind) {
        case 'picking':
            return stage.isFinalHours ? `Week ${stage.weekNumber}: last hours to pick` : `Week ${stage.weekNumber}: picks open`
        case 'locked':
            return `Week ${stage.weekNumber}: picks closed`
        case 'over':
            return 'Over'
    }
}
