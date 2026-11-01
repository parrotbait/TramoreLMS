// Created by Claude driven by Eddie Long on 2026-11-01.

import { describe, expect, it } from 'vitest'

import { mailerFromEnv } from '../mailer'
import { signInEmail } from '../templates'

const link = 'https://tramorelastmanstanding.vercel.app/auth/verify?token=abc&next=%2Fpick'

describe('signInEmail', () => {
    it('gives players the link and the 30-minute limit', () => {
        const email = signInEmail(link, 'signin')
        expect(email.subject).toBe('Your sign-in link · Last Man Standing')
        expect(email.text).toContain(link)
        expect(email.text).toContain('30 minutes')
        expect(email.text).toContain('Tramore Athletic Fundraiser')
    })

    it('gives admins the 15-minute limit', () => {
        const email = signInEmail(link, 'admin')
        expect(email.subject).toContain('admin')
        expect(email.text).toContain('15 minutes')
    })

    it('escapes the link in the HTML', () => {
        const email = signInEmail(link, 'signin')
        expect(email.html).toContain('token=abc&amp;next=%2Fpick')
        expect(email.html).not.toContain('token=abc&next')
    })

    it('uses smart quotes in the wording', () => {
        expect(signInEmail(link, 'signin').text).toContain('Here’s your link')
    })
})

describe('mailerFromEnv', () => {
    it('defaults to printing in the terminal', () => {
        expect(() => {
            return mailerFromEnv({})
        }).not.toThrow()
    })

    it('needs the Gmail address and app password for gmail', () => {
        expect(() => {
            return mailerFromEnv({ EMAIL_TRANSPORT: 'gmail' })
        }).toThrow('GMAIL_USER and GMAIL_APP_PASSWORD')
    })

    it('rejects an unknown transport', () => {
        expect(() => {
            return mailerFromEnv({ EMAIL_TRANSPORT: 'pigeon' })
        }).toThrow('Unknown EMAIL_TRANSPORT')
    })
})
