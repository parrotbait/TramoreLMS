// Created by Claude driven by Eddie Long on 2026-11-01.

import { requestLinkAction } from '@/auth/actions'
import { AuthCard, SignInForm } from '@/components/AuthCard'

export const dynamic = 'force-dynamic'

interface AdminSignInPageProps {
    readonly searchParams: Promise<{ readonly sent?: string; readonly error?: string }>
}

export default async function AdminSignInPage({ searchParams }: AdminSignInPageProps) {
    const params = await searchParams

    if (params.sent === '1') {
        return (
            <AuthCard title="Check your email">
                <p className="text-sm text-muted">
                    If that address is an admin, we’ve sent a sign-in link. It works once, for 15 minutes.
                </p>
            </AuthCard>
        )
    }

    return (
        <AuthCard title="Admin sign in">
            {params.error === 'email'
                ? <p role="alert" className="rounded-xl bg-subtle px-3 py-2 text-sm font-semibold text-maroon">That doesn’t look like an email address.</p>
                : null}
            <SignInForm action={requestLinkAction} purpose="admin" buttonLabel="Email me an admin link" />
        </AuthCard>
    )
}
