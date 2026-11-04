// Created by Claude driven by Eddie Long on 2026-11-01.

import Link from 'next/link'

import { requestLinkAction } from '@/auth/actions'
import { AuthCard, SignInForm } from '@/components/AuthCard'

export const dynamic = 'force-dynamic'

interface SignInPageProps {
    readonly searchParams: Promise<{ readonly sent?: string; readonly error?: string; readonly next?: string }>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
    const params = await searchParams

    if (params.sent === '1') {
        return (
            <AuthCard title="Check your email">
                <p className="text-sm text-muted">
                    If you entered with that email, we sent you a link. You can use it once, for 30 minutes.
                </p>
                <p className="text-sm text-muted">
                    Nothing there? Check your spam folder, or <Link href="/signin" className="font-semibold text-maroon underline">try again</Link>.
                </p>
            </AuthCard>
        )
    }

    return (
        <AuthCard title="Sign in">
            <p className="text-sm text-muted">
                There is no password. Type the email you entered with. We will email you a link.
            </p>
            {params.error === 'email'
                ? <p role="alert" className="rounded-xl bg-subtle px-3 py-2 text-sm font-semibold text-maroon">That doesn’t look like an email address.</p>
                : null}
            <SignInForm action={requestLinkAction} purpose="signin" next={params.next} buttonLabel="Email me a link" />
        </AuthCard>
    )
}
