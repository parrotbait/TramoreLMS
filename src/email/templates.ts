// Created by Claude driven by Eddie Long on 2026-11-01.
//
// Email wording. Plain text plus simple inline-styled HTML, which renders the
// same in Gmail, Outlook and Apple Mail. Smart quotes throughout.

import type { LinkPurpose } from '@/auth/rules'
import { brand, colours } from '@/theme/tokens'

import { button, emailLayout, escapeHtml, note, paragraph } from './layout'

export interface EmailContent {
    readonly subject: string
    readonly text: string
    readonly html: string
}

export function signInEmail(link: string, purpose: LinkPurpose): EmailContent {
    const isAdmin = purpose === 'admin'
    const minutes = isAdmin ? 15 : 30
    const subject = isAdmin
        ? 'Your admin sign-in link · Last Man Standing'
        : 'Your sign-in link · Last Man Standing'
    const intro = isAdmin
        ? 'Here’s your link to the Last Man Standing admin area.'
        : 'Here’s your link to sign in to Last Man Standing.'
    const footer = `The link works once, for ${minutes} minutes. If you didn’t ask for it, you can ignore this email.`

    const text = [
        intro,
        '',
        link,
        '',
        footer,
        '',
        `Last Man Standing · ${brand.fundraisingLine}`,
    ].join('\n')

    const html = emailLayout({
        title: 'Last Man Standing',
        anyLink: link,
        body: [
            paragraph(intro, { bottom: 20 }),
            button(link, 'Sign in'),
            note(footer),
            note(link, { bottom: 0, breakAll: true }),
        ].join('\n'),
    })

    return { subject, text, html }
}

/** Sent once the entry fee is through. The link lasts 24 hours, and the sign-in page can always send another. */
export function welcomeEmail(link: string, competitionName: string, isDemo = false): EmailContent {
    const subject = 'You’re in · Last Man Standing'
    const intro = isDemo
        ? `You’re in the demo, ${competitionName}. Your test payment worked. This is a pretend game, so no real money was taken.`
        : `Thanks for entering ${competitionName} and for helping Tramore Athletic. Your payment worked.`
    const next = 'Use this link to sign in and make your first pick:'
    const footer = 'The link works once, for 24 hours. After that, ask for a new one on the sign-in page.'

    const text = [intro, '', next, link, '', footer, '', `Last Man Standing · ${brand.fundraisingLine}`].join('\n')

    const html = emailLayout({
        title: 'You’re in!',
        anyLink: link,
        body: [
            paragraph(intro),
            button(link, 'Make your pick'),
            note(footer, { bottom: 0 }),
        ].join('\n'),
    })

    return { subject, text, html }
}

/** Sent when an admin adds a player by hand (cash or Revolut). The link lasts 24 hours. */
export function addedEntryEmail(link: string, competitionName: string, displayName: string): EmailContent {
    const subject = 'You’re in · Last Man Standing'
    const intro = `You’ve been added to ${competitionName} as “${displayName}”. Thanks for helping Tramore Athletic.`
    const next = 'Use this link to sign in and make your first pick:'
    const footer = 'The link works once, for 24 hours. After that, sign in on the website with this email address.'

    const text = [intro, '', next, link, '', footer, '', `Last Man Standing · ${brand.fundraisingLine}`].join('\n')

    const html = emailLayout({
        title: 'You’re in!',
        anyLink: link,
        body: [
            paragraph(intro),
            button(link, 'Make your pick'),
            note(footer, { bottom: 0 }),
        ].join('\n'),
    })

    return { subject, text, html }
}

export interface ReminderDetails {
    readonly weekNumber: number
    readonly plMatchday: number
    /** For example “Sat 14 Nov, 11:30”. */
    readonly cutoffLabel: string
    /** The person’s entries that haven’t picked. Their own names only. */
    readonly entryNames: readonly string[]
}

/** The reminder before the cut-off (Decision 11). The link lasts until the cut-off. */
export function reminderEmail(link: string, details: ReminderDetails): EmailContent {
    const subject = `Week ${details.weekNumber} pick needed by ${details.cutoffLabel} · Last Man Standing`
    const intro = `You haven’t made your Week ${details.weekNumber} pick yet (PL Matchday ${details.plMatchday}).`
    const entries = details.entryNames.length === 1
        ? `Entry: ${details.entryNames[0] ?? ''}`
        : `Entries: ${details.entryNames.join(', ')}`
    const cutoff = `The cut-off is ${details.cutoffLabel}. If you don’t pick by then, we pick for you.`
    const footer = 'You can use the link once, until the cut-off. After that, sign in on the website.'

    const text = [
        intro,
        entries,
        '',
        cutoff,
        '',
        'Make your pick:',
        link,
        '',
        footer,
        '',
        `Last Man Standing · ${brand.fundraisingLine}`,
    ].join('\n')

    const html = emailLayout({
        title: `Week ${details.weekNumber} pick needed`,
        anyLink: link,
        body: [
            paragraph(intro, { bottom: 8 }),
            note(entries, { bottom: 16 }),
            paragraph(cutoff, { bottom: 20 }),
            button(link, 'Make your pick'),
            note(footer, { bottom: 0 }),
        ].join('\n'),
    })

    return { subject, text, html }
}

export interface AlertLine {
    readonly competitionName: string
    readonly message: string
}

/** To the admins when new alerts open (PLAN.md section 6). One email per tick. */
export function alertEmail(alertsPageUrl: string, lines: readonly AlertLine[]): EmailContent {
    const subject = lines.length === 1
        ? 'New alert · Last Man Standing'
        : `${lines.length} new alerts · Last Man Standing`
    const intro = lines.length === 1 ? 'Something needs a look.' : 'Some things need a look.'
    const items = lines.map((line) => {
        return `${line.competitionName}: ${line.message}`
    })

    const text = [
        intro,
        '',
        ...items.map((item) => {
            return `• ${item}`
        }),
        '',
        'Open the alerts page:',
        alertsPageUrl,
        '',
        `Last Man Standing · ${brand.fundraisingLine}`,
    ].join('\n')

    const html = emailLayout({
        title: subject.replace(' · Last Man Standing', ''),
        anyLink: alertsPageUrl,
        body: [
            paragraph(intro, { bottom: 12 }),
            `<ul class="ink" style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.5;color:${colours.text}">${items.map((item) => {
                return `<li style="margin:0 0 8px">${escapeHtml(item)}</li>`
            }).join('')}</ul>`,
            button(alertsPageUrl, 'Open the alerts'),
        ].join('\n'),
    })

    return { subject, text, html }
}

export interface SignUpDetails {
    readonly displayName: string
    /** The player’s email, so the admins can contact them. */
    readonly email: string
    readonly competitionName: string
    /** For example “card”, “cash” or “Revolut”. */
    readonly paidBy: string
    /** For example “€10.00”. */
    readonly amountLabel: string
    /** Active players in the competition now, this one included. */
    readonly playerCount: number
    readonly entriesUrl: string
}

/** To the admins when a player joins and has paid. One email per player. */
export function signUpEmail(details: SignUpDetails): EmailContent {
    const subject = `New player: ${details.displayName} · Last Man Standing`
    const intro = `${details.displayName} has joined ${details.competitionName}.`
    const contact = `Email: ${details.email}`
    const paid = `Paid ${details.amountLabel} by ${details.paidBy}.`
    const count = details.playerCount === 1 ? '1 player is in.' : `${details.playerCount} players are in.`

    const text = [
        intro,
        contact,
        paid,
        count,
        '',
        'Open the entries page:',
        details.entriesUrl,
        '',
        `Last Man Standing · ${brand.fundraisingLine}`,
    ].join('\n')

    const html = emailLayout({
        title: 'New player',
        anyLink: details.entriesUrl,
        body: [
            paragraph(intro, { bottom: 8 }),
            note(contact, { bottom: 4, breakAll: true }),
            note(paid, { bottom: 4 }),
            note(count, { bottom: 20 }),
            button(details.entriesUrl, 'Open the entries'),
        ].join('\n'),
    })

    return { subject, text, html }
}

/** To a demo guest (Admin → Demo → Add a guest). The link lasts 24 hours. */
export function demoInviteEmail(link: string, guestName: string): EmailContent {
    const subject = 'Try the Last Man Standing demo'
    const intro = `Hi ${guestName}. You’re invited to try the Last Man Standing demo.`
    const about = 'It’s a pretend competition. Nothing is real, and no money is taken.'
    const footer = 'The link works once, for 24 hours. After that, sign in on the website with this email.'

    const text = [intro, about, '', 'Tap the link to sign in and make your pick:', link, '', footer, '', `Last Man Standing · ${brand.fundraisingLine}`].join('\n')

    const html = emailLayout({
        title: 'Try the demo',
        anyLink: link,
        body: [
            paragraph(intro, { bottom: 8 }),
            note(about, { bottom: 20 }),
            button(link, 'Make your pick'),
            note(footer, { bottom: 0 }),
        ].join('\n'),
    })

    return { subject, text, html }
}
