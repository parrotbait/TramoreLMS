// Created by Claude driven by Eddie Long on 2026-11-01.
//
// Sending email. Chosen by EMAIL_TRANSPORT:
//   console  prints the message in the server terminal (the default locally)
//   gmail    sends through the club Gmail with an app password (GMAIL_USER,
//            GMAIL_APP_PASSWORD). Players see the club address.
// A Resend transport can be added here later, once the club has a domain.

import nodemailer from 'nodemailer'

import type { EmailContent } from './templates'

export interface EmailMessage extends EmailContent {
    readonly to: string
}

export interface Mailer {
    send(message: EmailMessage): Promise<void>
}

const FROM_NAME = 'Tramore Athletic Last Man Standing'

export function mailerFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): Mailer {
    const transport = env['EMAIL_TRANSPORT'] ?? 'console'

    switch (transport) {
        case 'console':
            return consoleMailer
        case 'gmail':
            return withLogging(gmailMailer(env['GMAIL_USER'] ?? '', env['GMAIL_APP_PASSWORD'] ?? '', env['EMAIL_REPLY_TO']))
        default:
            throw new Error(`Unknown EMAIL_TRANSPORT “${transport}”. Use console or gmail.`)
    }
}

/** Where the log lines go. Tests pass their own. */
export interface MailLog {
    info(message: string): void
    error(message: string): void
}

/**
 * Logs every send, so slow and failed emails show up in the Vercel logs.
 * Search the logs for “[email]”. A “sending” line with no “sent” or
 * “failed” after it means the function stopped before Gmail answered.
 * The address is shortened, for example a***@gmail.com.
 */
export function withLogging(mailer: Mailer, log: MailLog = console): Mailer {
    return {
        send: async (message) => {
            const label = `to=${maskedAddress(message.to)} subject="${message.subject}"`
            const startedAt = Date.now()
            log.info(`[email] sending ${label}`)

            try {
                await mailer.send(message)
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error)
                log.error(`[email] failed ${label} ms=${Date.now() - startedAt} error="${reason}"`)
                throw error
            }

            log.info(`[email] sent ${label} ms=${Date.now() - startedAt}`)
        },
    }
}

function maskedAddress(address: string): string {
    const at = address.lastIndexOf('@')
    if (at < 1) {
        return '***'
    }

    return `${address.slice(0, 1)}***${address.slice(at)}`
}

const consoleMailer: Mailer = {
    send: async (message) => {
        console.log([
            '',
            '──────── Email (EMAIL_TRANSPORT=console) ────────',
            `To:      ${message.to}`,
            `Subject: ${message.subject}`,
            '',
            message.text,
            '─────────────────────────────────────────────────',
            '',
        ].join('\n'))
    },
}

/**
 * Nodemailer waits minutes by default. Gmail answers in about a second, so a
 * connection that is silent for 10 seconds is stuck, and the tick should move on.
 */
export function gmailTransportOptions(user: string, appPassword: string) {
    return {
        service: 'gmail',
        auth: { user, pass: appPassword },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
    } as const
}

function gmailMailer(user: string, appPassword: string, replyTo: string | undefined): Mailer {
    if (user === '' || appPassword === '') {
        throw new Error('EMAIL_TRANSPORT=gmail needs GMAIL_USER and GMAIL_APP_PASSWORD.')
    }

    const transporter = nodemailer.createTransport(gmailTransportOptions(user, appPassword))

    return {
        send: async (message) => {
            await transporter.sendMail({
                from: { name: FROM_NAME, address: user },
                ...(replyTo === undefined || replyTo === '' ? {} : { replyTo }),
                to: message.to,
                subject: message.subject,
                text: message.text,
                html: message.html,
            })
        },
    }
}
