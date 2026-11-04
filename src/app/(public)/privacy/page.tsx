// Created by Claude driven by Eddie Long on 2026-11-04.
//
// The privacy page (Decision 17), in very simple English. Keep it true to
// what the code does: one sign-in cookie, emails seen by the organisers only,
// and emails removed 90 days after the end (src/jobs/plan-retention.ts).

import type { Metadata } from 'next'

import { RETENTION_DAYS } from '@/jobs/plan-retention'
import { brand } from '@/theme/tokens'

export const metadata: Metadata = {
    title: 'Privacy · Last Man Standing',
}

const SECTIONS: readonly { readonly title: string; readonly lines: readonly string[] }[] = [
    {
        title: 'What we keep',
        lines: [
            'Your email address. We use it to sign you in and to remind you to pick.',
            'The name you play under.',
            'Your picks.',
            'Your payments. Stripe takes the card payment. We never see your card details.',
        ],
    },
    {
        title: 'Who can see it',
        lines: [
            'Other players can see your name and your picks. Picks show after the cut-off.',
            'Your name may be in the pictures we post in the club WhatsApp group.',
            'Only the organisers can see your email address.',
        ],
    },
    {
        title: 'How long we keep it',
        lines: [
            `We delete your email ${RETENTION_DAYS} days after the competition ends.`,
            'If you ticked the box to hear about future competitions, we keep it until you ask us to delete it.',
            'Your name and picks stay in the results.',
        ],
    },
    {
        title: 'Cookies',
        lines: [
            'We use one cookie to keep you signed in. That is all. No tracking.',
        ],
    },
    {
        title: 'Who helps us',
        lines: [
            'Stripe takes payments. Vercel runs the website. Neon stores the data. Google Gmail sends the emails.',
        ],
    },
]

export default function PrivacyPage() {
    return (
        <>
            <h1 className="text-2xl font-bold">Privacy</h1>
            {SECTIONS.map((section) => {
                return (
                    <section key={section.title} className="space-y-1">
                        <h2 className="text-lg font-bold">{section.title}</h2>
                        {section.lines.map((line) => {
                            return <p key={line}>{line}</p>
                        })}
                    </section>
                )
            })}
            <section className="space-y-1">
                <h2 className="text-lg font-bold">Delete your details</h2>
                <p>
                    Email us at{' '}
                    <a href={`mailto:${brand.contactEmail}`} className="font-semibold text-maroon underline">{brand.contactEmail}</a>.
                </p>
                <p>We delete your email. Your name changes to “Removed player”.</p>
            </section>
        </>
    )
}
