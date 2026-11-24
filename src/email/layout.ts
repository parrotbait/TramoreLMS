// Created by Claude driven by Eddie Long on 2026-11-24.
//
// The look shared by every email: a maroon header with the club shield, a gold
// stripe, a white card, and a footer. Colours come from src/theme/tokens.ts.
//
// Light and dark mode.
//   - Every colour is set inline, so the email looks right in any client.
//   - A <style> block then swaps in dark colours for clients that honour
//     prefers-color-scheme (Apple Mail, iOS Mail, Outlook.app). Outlook.com has its own
//     [data-ogsc] hook. Gmail ignores both and inverts colours itself, so the
//     brand pieces are chosen to survive that: the shield sits on a white badge,
//     the button has a gold border, and the header is a strong colour.
//   - The header and the badge never change between modes.
// Text and tables only, as email clients support little else.

import { brand, colours } from '@/theme/tokens'

const DARK = {
    page: '#141010',
    card: '#1F1A1A',
    text: '#F3EEE6',
    muted: '#B8AFA4',
    line: '#3A3333',
} as const

const FONT = '-apple-system,Segoe UI,Helvetica,Arial,sans-serif'

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

/** The site’s address, taken from a link in the email, so the shield can be loaded from it. */
function originOf(link: string): string | null {
    try {
        return new URL(link).origin
    } catch {
        return null
    }
}

/** A paragraph in the body text colour. */
export function paragraph(text: string, options: { readonly bottom?: number; readonly size?: number } = {}): string {
    return `<p class="ink" style="margin:0 0 ${options.bottom ?? 16}px;font-size:${options.size ?? 16}px;line-height:1.5;color:${colours.text}">${escapeHtml(text)}</p>`
}

/** A smaller, quieter paragraph. */
export function note(text: string, options: { readonly bottom?: number; readonly breakAll?: boolean } = {}): string {
    const breakAll = options.breakAll === true ? 'word-break:break-all;' : ''
    return `<p class="muted" style="margin:0 0 ${options.bottom ?? 8}px;font-size:13px;line-height:1.5;${breakAll}color:${colours.muted}">${escapeHtml(text)}</p>`
}

/** The main button. Maroon with a gold edge. In dark mode it turns gold, which reads better on a dark card. */
export function button(href: string, label: string): string {
    return `<p style="margin:0 0 20px"><a class="button" href="${escapeHtml(href)}" style="display:inline-block;background:${colours.maroon};color:${colours.onMaroon};text-decoration:none;font-weight:700;font-size:16px;padding:13px 24px;border-radius:12px;border:2px solid ${colours.gold}">${escapeHtml(label)}</a></p>`
}

export interface LayoutOptions {
    /** The heading in the header, for example “You’re in!”. */
    readonly title: string
    /** Any link in the email. Its address tells us where the shield lives. */
    readonly anyLink: string
    /** The body, built from paragraph(), note() and button(). */
    readonly body: string
}

export function emailLayout({ title, anyLink, body }: LayoutOptions): string {
    const origin = originOf(anyLink)
    const shield = origin === null
        ? ''
        : `<td width="64" valign="middle" style="padding-right:14px"><div style="width:56px;height:56px;border-radius:28px;background:#FFFFFF;text-align:center"><img src="${escapeHtml(origin)}/brand/logo-shield-email.png" width="42" height="43" alt="" style="display:inline-block;margin-top:7px;border:0"></div></td>`

    return `<!doctype html>
<html lang="en-IE">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .page { background:${DARK.page} !important; }
    .card { background:${DARK.card} !important; }
    .ink { color:${DARK.text} !important; }
    .muted { color:${DARK.muted} !important; }
    .rule { border-color:${DARK.line} !important; }
    .button { background:${colours.gold} !important; color:${colours.onGold} !important; }
  }
  [data-ogsc] .page { background:${DARK.page} !important; }
  [data-ogsc] .card { background:${DARK.card} !important; }
  [data-ogsc] .ink { color:${DARK.text} !important; }
  [data-ogsc] .muted { color:${DARK.muted} !important; }
  [data-ogsc] .button { background:${colours.gold} !important; color:${colours.onGold} !important; }
</style>
</head>
<body class="page" style="margin:0;padding:24px 12px;background:${colours.subtle};font-family:${FONT};color:${colours.text}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto">
    <tr><td style="background:${colours.maroon};color:${colours.onMaroon};padding:20px 24px;border-radius:16px 16px 0 0">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        ${shield}
        <td valign="middle">
          <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${colours.gold}">${escapeHtml(brand.clubName)}</div>
          <div style="font-size:22px;font-weight:700;line-height:1.25;color:${colours.onMaroon}">${escapeHtml(title)}</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="background:${colours.gold};height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>
    <tr><td class="card" style="background:${colours.surface};padding:24px;border-radius:0 0 16px 16px">
      ${body}
    </td></tr>
    <tr><td class="muted" style="padding:16px 8px 0;text-align:center;font-size:12px;line-height:1.5;color:${colours.muted}">
      Last Man Standing · ${escapeHtml(brand.fundraisingLine)}<br>
      Questions? <a href="mailto:${escapeHtml(brand.contactEmail)}" class="muted" style="color:${colours.muted}">${escapeHtml(brand.contactEmail)}</a>
    </td></tr>
  </table>
</body>
</html>`
}
