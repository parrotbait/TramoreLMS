// Created by Claude driven by Eddie Long on 2026-11-04.
//
// The Demo page's buttons. Each one checks for an admin on the server,
// writes an audit entry, and returns to the page with a notice.

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { recordAudit } from '@/admin/audit'
import { requireAdmin } from '@/admin/guard'
import { siteUrl } from '@/auth/session'
import { getDatabase } from '@/db/client'
import { mailerFromEnv } from '@/email/mailer'
import { validateEntryForm } from '@/payments/entry-rules'

import { addDemoGuest, findDemo, nextDemoStep, sendDemoInvite, startDemo, wipeDemo } from './service'
import type { DemoEmail } from './service'

const PAGE = '/admin/demo'

export async function startDemoAction(formData: FormData) {
    const admin = await requireAdmin()
    const form = validateEntryForm({ displayName: text(formData, 'name'), email: admin.email })
    if (!form.ok) {
        back('error', 'Give yourself a name of up to 20 letters.')
    }

    const db = getDatabase()
    if (await findDemo(db) !== null) {
        back('error', 'A demo is already running. Wipe it first.')
    }

    const competitionId = await startDemo(db, { personId: admin.personId, name: form.displayName }, new Date())
    await recordAudit(db, {
        actorEmail: admin.email,
        action: 'demo.start',
        targetType: 'competition',
        targetId: competitionId,
        reason: 'Demo started',
    })

    back('notice', 'The demo is ready. Open the pick screen to play.')
}

export async function nextDemoStepAction() {
    await requireAdmin()
    const reminders = await nextDemoStep(getDatabase(), new Date(), demoEmail())
    back('notice', reminders === 0 ? 'Done.' : `Done. Sent ${reminders} reminder ${reminders === 1 ? 'email' : 'emails'}.`)
}

export async function addDemoGuestAction(formData: FormData) {
    const admin = await requireAdmin()
    const form = validateEntryForm({ displayName: text(formData, 'name'), email: text(formData, 'email') })
    if (!form.ok) {
        back('error', 'Check the name (up to 20 letters) and the email address.')
    }

    const db = getDatabase()
    const result = await addDemoGuest(db, form.displayName, form.email)
    if (result.kind === 'noDemo') {
        back('error', 'Start a demo first.')
    }

    if (result.kind === 'nameTaken') {
        back('error', `Someone in the demo is already called “${form.displayName}”.`)
    }

    // The audit log keeps the name only. Emails never go in it (privacy page).
    await recordAudit(db, {
        actorEmail: admin.email,
        action: 'demo.addGuest',
        targetType: 'competition',
        targetId: result.competitionId,
        reason: `Demo guest “${form.displayName}”`,
    })

    try {
        const guest = { personId: result.personId, email: form.email, name: form.displayName }
        await sendDemoInvite(db, demoEmail(), guest, new Date())
    } catch (error) {
        console.error('Demo invite email failed', error)
        back('error', `Added “${form.displayName}”, but the email didn’t send. They can sign in at /signin with that email.`)
    }

    back('notice', `Added “${form.displayName}” and emailed them a link to play.`)
}

export async function wipeDemoAction() {
    const admin = await requireAdmin()
    const db = getDatabase()
    const removed = await wipeDemo(db, process.env['ADMIN_EMAILS'])
    await recordAudit(db, {
        actorEmail: admin.email,
        action: 'demo.wipe',
        targetType: 'competition',
        targetId: 'demo',
        after: { entriesRemoved: removed },
        reason: 'Demo wiped',
    })

    back('notice', 'The demo is wiped. You can start a new one.')
}

function demoEmail(): DemoEmail {
    return { mailer: mailerFromEnv(), siteUrl: siteUrl() }
}

function back(kind: 'notice' | 'error', message: string): never {
    revalidatePath('/', 'layout')
    redirect(`${PAGE}?${kind}=${encodeURIComponent(message)}`)
}

function text(formData: FormData, name: string): string {
    const value = formData.get(name)
    return typeof value === 'string' ? value.trim() : ''
}
