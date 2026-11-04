// Created by Claude driven by Eddie Long on 2026-11-01.
//
// The link in the email opens this page. The page signs the player in by
// itself (AutoSignIn submits the form). Signing in is a form submission, not
// the page load, because email scanners fetch links before people do and
// would otherwise use up the single-use link.

import Link from 'next/link'

import { verifyLinkAction } from '@/auth/actions'
import { AuthCard } from '@/components/AuthCard'
import { AutoSignIn } from '@/components/AutoSignIn'

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
        <AuthCard title="Signing in">
            <AutoSignIn action={verifyLinkAction} token={params.token} next={params.next} />
        </AuthCard>
    )
}
