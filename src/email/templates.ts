// Created by Claude driven by Eddie Long on 2026-11-01.
//
// Email wording. Plain text plus simple inline-styled HTML, which renders the
// same in Gmail, Outlook and Apple Mail. Smart quotes throughout.

import type { LinkPurpose } from '@/auth/rules'
import { brand, colours } from '@/theme/tokens'

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

    const html = `<!doctype html>
<html lang="en-IE">
<body style="margin:0;padding:24px;background:${colours.subtle};font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${colours.text}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:${colours.surface};border-radius:16px;overflow:hidden">
    <tr><td style="background:${colours.maroon};color:${colours.onMaroon};padding:20px 24px">
      <div style="font-size:20px;font-weight:700">Last Man Standing</div>
      <div style="font-size:13px;opacity:0.9">${escapeHtml(brand.fundraisingLine)}</div>
    </td></tr>
    <tr><td style="padding:24px">
      <p style="margin:0 0 20px;font-size:16px">${escapeHtml(intro)}</p>
      <p style="margin:0 0 20px">
        <a href="${escapeHtml(link)}" style="display:inline-block;background:${colours.maroon};color:${colours.onMaroon};text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px">Sign in</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:${colours.muted}">${escapeHtml(footer)}</p>
      <p style="margin:0;font-size:12px;color:${colours.muted};word-break:break-all">${escapeHtml(link)}</p>
    </td></tr>
  </table>
</body>
</html>`

    return { subject, text, html }
}

/** Sent once the entry fee is through. The link lasts 24 hours, and the sign-in page can always send another. */
export function welcomeEmail(link: string, competitionName: string): EmailContent {
    const subject = 'You’re in · Last Man Standing'
    const intro = `Thanks for entering ${competitionName}, and for supporting Tramore Athletic. Your payment is through.`
    const next = 'Use this link to sign in and make your first pick:'
    const footer = 'The link works once, for 24 hours. After that, ask for a new one on the sign-in page.'

    const text = [intro, '', next, link, '', footer, '', `Last Man Standing · ${brand.fundraisingLine}`].join('\n')

    const html = `<!doctype html>
<html lang="en-IE">
<body style="margin:0;padding:24px;background:${colours.subtle};font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${colours.text}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:${colours.surface};border-radius:16px;overflow:hidden">
    <tr><td style="background:${colours.maroon};color:${colours.onMaroon};padding:20px 24px">
      <div style="font-size:20px;font-weight:700">You’re in!</div>
      <div style="font-size:13px;opacity:0.9">${escapeHtml(brand.fundraisingLine)}</div>
    </td></tr>
    <tr><td style="padding:24px">
      <p style="margin:0 0 16px;font-size:16px">${escapeHtml(intro)}</p>
      <p style="margin:0 0 20px">
        <a href="${escapeHtml(link)}" style="display:inline-block;background:${colours.maroon};color:${colours.onMaroon};text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px">Make your pick</a>
      </p>
      <p style="margin:0;font-size:13px;color:${colours.muted}">${escapeHtml(footer)}</p>
    </td></tr>
  </table>
</body>
</html>`

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
    const cutoff = `The cut-off is ${details.cutoffLabel}. If you don’t pick by then, a team is picked for you.`
    const footer = 'The link signs you in once, and works until the cut-off. After that, sign in on the site as usual.'

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

    const html = `<!doctype html>
<html lang="en-IE">
<body style="margin:0;padding:24px;background:${colours.subtle};font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${colours.text}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:${colours.surface};border-radius:16px;overflow:hidden">
    <tr><td style="background:${colours.maroon};color:${colours.onMaroon};padding:20px 24px">
      <div style="font-size:20px;font-weight:700">Week ${details.weekNumber} pick needed</div>
      <div style="font-size:13px;opacity:0.9">${escapeHtml(brand.fundraisingLine)}</div>
    </td></tr>
    <tr><td style="padding:24px">
      <p style="margin:0 0 8px;font-size:16px">${escapeHtml(intro)}</p>
      <p style="margin:0 0 16px;font-size:14px;color:${colours.muted}">${escapeHtml(entries)}</p>
      <p style="margin:0 0 20px;font-size:16px">${escapeHtml(cutoff)}</p>
      <p style="margin:0 0 20px">
        <a href="${escapeHtml(link)}" style="display:inline-block;background:${colours.maroon};color:${colours.onMaroon};text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px">Make your pick</a>
      </p>
      <p style="margin:0;font-size:13px;color:${colours.muted}">${escapeHtml(footer)}</p>
    </td></tr>
  </table>
</body>
</html>`

    return { subject, text, html }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}
