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
            return gmailMailer(env['GMAIL_USER'] ?? '', env['GMAIL_APP_PASSWORD'] ?? '', env['EMAIL_REPLY_TO'])
        default:
            throw new Error(`Unknown EMAIL_TRANSPORT “${transport}”. Use console or gmail.`)
    }
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

function gmailMailer(user: string, appPassword: string, replyTo: string | undefined): Mailer {
    if (user === '' || appPassword === '') {
        throw new Error('EMAIL_TRANSPORT=gmail needs GMAIL_USER and GMAIL_APP_PASSWORD.')
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass: appPassword },
    })

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
