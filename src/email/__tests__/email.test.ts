// Created by Claude driven by Eddie Long on 2026-11-01.

import { describe, expect, it } from 'vitest'

import { mailerFromEnv, withLogging } from '../mailer'
import { addedEntryEmail, alertEmail, demoInviteEmail, reminderEmail, signInEmail } from '../templates'

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

describe('reminderEmail', () => {
    const details = { weekNumber: 3, plMatchday: 14, cutoffLabel: 'Sat 21 Nov, 11:30', entryNames: ['Aoife K'] }

    it('gives the week, the cut-off and the link', () => {
        const email = reminderEmail(link, details)
        expect(email.subject).toBe('Week 3 pick needed by Sat 21 Nov, 11:30 · Last Man Standing')
        expect(email.text).toContain('You haven’t made your Week 3 pick yet (PL Matchday 14).')
        expect(email.text).toContain('Entry: Aoife K')
        expect(email.text).toContain('The cut-off is Sat 21 Nov, 11:30.')
        expect(email.text).toContain(link)
        expect(email.text).toContain('You can use the link once, until the cut-off.')
    })

    it('lists every entry on the email that hasn’t picked', () => {
        const email = reminderEmail(link, { ...details, entryNames: ['Aoife K', 'Aoife’s Dad'] })
        expect(email.text).toContain('Entries: Aoife K, Aoife’s Dad')
    })

    it('escapes names in the HTML', () => {
        const email = reminderEmail(link, { ...details, entryNames: ['<b>Kev</b>'] })
        expect(email.html).toContain('&lt;b&gt;Kev&lt;/b&gt;')
        expect(email.html).not.toContain('<b>Kev</b>')
    })
})

describe('alertEmail', () => {
    const page = 'https://tramorelastmanstanding.vercel.app/admin/alerts'

    it('lists each alert with its competition, and links to the alerts page', () => {
        const email = alertEmail(page, [
            { competitionName: 'LMS 2026/27', message: 'The two feeds disagree on the score for Arsenal v Chelsea.' },
            { competitionName: 'LMS 2026/27', message: 'Week 4 has no fixtures.' },
        ])
        expect(email.subject).toBe('2 new alerts · Last Man Standing')
        expect(email.text).toContain('• LMS 2026/27: The two feeds disagree on the score for Arsenal v Chelsea.')
        expect(email.text).toContain('• LMS 2026/27: Week 4 has no fixtures.')
        expect(email.text).toContain(page)
    })

    it('says “alert” for one', () => {
        expect(alertEmail(page, [{ competitionName: 'LMS', message: 'x' }]).subject).toBe('New alert · Last Man Standing')
    })

    it('escapes messages in the HTML', () => {
        const email = alertEmail(page, [{ competitionName: 'LMS', message: '“<b>Kev</b>” paid twice.' }])
        expect(email.html).toContain('&lt;b&gt;Kev&lt;/b&gt;')
        expect(email.html).not.toContain('<b>Kev</b>')
    })
})

describe('demoInviteEmail', () => {
    it('says it is a demo, and gives the link and how long it lasts', () => {
        const email = demoInviteEmail(link, 'Aoife')
        expect(email.subject).toBe('Try the Last Man Standing demo')
        expect(email.text).toContain('Hi Aoife. You’re invited to try the Last Man Standing demo.')
        expect(email.text).toContain('Nothing is real, and no money is taken.')
        expect(email.text).toContain(link)
        expect(email.text).toContain('for 24 hours')
    })

    it('escapes the name in the HTML', () => {
        expect(demoInviteEmail(link, '<b>Kev</b>').html).toContain('&lt;b&gt;Kev&lt;/b&gt;')
    })
})

describe('addedEntryEmail', () => {
    it('says they were added, and gives the link and how long it lasts', () => {
        const email = addedEntryEmail(link, 'Last Man Standing 2026/27', 'Aoife')
        expect(email.subject).toBe('You’re in · Last Man Standing')
        expect(email.text).toContain('You’ve been added to Last Man Standing 2026/27 as “Aoife”.')
        expect(email.text).toContain(link)
        expect(email.text).toContain('for 24 hours')
        expect(email.html).toContain(`href="${link.replace(/&/g, '&amp;')}"`)
    })

    it('does not say a payment worked, as nobody paid online', () => {
        expect(addedEntryEmail(link, 'LMS', 'Aoife').text).not.toContain('payment')
    })

    it('escapes the names in the HTML', () => {
        const email = addedEntryEmail(link, '<i>LMS</i>', '<b>Kev</b>')
        expect(email.html).toContain('&lt;b&gt;Kev&lt;/b&gt;')
        expect(email.html).toContain('&lt;i&gt;LMS&lt;/i&gt;')
        expect(email.html).not.toContain('<b>Kev</b>')
    })
})

describe('withLogging', () => {
    const message = { to: 'aoife@gmail.com', subject: 'Your sign-in link', text: 't', html: 'h' }

    function recorder() {
        const lines: string[] = []
        return {
            lines,
            log: {
                info: (line: string) => {
                    lines.push(line)
                },
                error: (line: string) => {
                    lines.push(line)
                },
            },
        }
    }

    it('logs before and after a send, with a shortened address and the time taken', async () => {
        const { lines, log } = recorder()
        const mailer = withLogging({ send: async () => {} }, log)

        await mailer.send(message)

        expect(lines).toHaveLength(2)
        expect(lines[0]).toBe('[email] sending to=a***@gmail.com subject="Your sign-in link"')
        expect(lines[1]).toMatch(/^\[email\] sent to=a\*\*\*@gmail\.com subject="Your sign-in link" ms=\d+$/)
    })

    it('never logs the full address', async () => {
        const { lines, log } = recorder()
        await withLogging({ send: async () => {} }, log).send(message)

        expect(lines.join('\n')).not.toContain('aoife')
    })

    it('logs the failure and still throws', async () => {
        const { lines, log } = recorder()
        const mailer = withLogging({
            send: async () => {
                throw new Error('Invalid login')
            },
        }, log)

        await expect(mailer.send(message)).rejects.toThrow('Invalid login')
        expect(lines[1]).toMatch(/^\[email\] failed .* ms=\d+ error="Invalid login"$/)
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
