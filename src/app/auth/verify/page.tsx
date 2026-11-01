// Created by Claude driven by Eddie Long on 2026-11-01.
//
// The link in the email opens this page. Signing in needs a button press,
// because email security scanners open links before people do. A scanner
// would otherwise use up the single-use link.

import Link from 'next/link'

import { verifyLinkAction } from '@/auth/actions'
import { AuthCard } from '@/components/AuthCard'

export const dynamic = 'force-dynamic'

interface VerifyPageProps {
    readonly searchParams: Promise<{ readonly token?: string; readonly next?: string; readonly error?: string }>
}

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
    const params = await searchParams

    if (params.error === 'invalid' || params.token === undefined || params.token === '') {
        return (
            <AuthCard title="That link has expired">
                <p className="text-sm text-muted">
                    Sign-in links work once, for a short time. Ask for a new one and use it straight away.
                </p>
                <Link href="/signin" className="block min-h-12 rounded-xl bg-maroon px-4 py-3 text-center font-bold text-on-maroon">
                    Get a new link
                </Link>
            </AuthCard>
        )
    }

    return (
        <AuthCard title="Sign in to Last Man Standing">
            <p className="text-sm text-muted">Press the button to finish signing in on this device.</p>
            <form action={verifyLinkAction}>
                <input type="hidden" name="token" value={params.token} />
                {params.next === undefined ? null : <input type="hidden" name="next" value={params.next} />}
                <button type="submit" className="min-h-12 w-full rounded-xl bg-maroon font-bold text-on-maroon">
                    Sign in
                </button>
            </form>
        </AuthCard>
    )
}
