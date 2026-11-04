// Created by Claude driven by Eddie Long on 2026-11-04.
//
// The sign-in form on the magic-link page, submitted by itself as soon as the
// page loads. Email scanners that fetch the link without running JavaScript
// never submit it, so they cannot use up the single-use link. The button is
// there if JavaScript is off.

'use client'

import { useEffect, useRef } from 'react'

interface AutoSignInProps {
    readonly action: (formData: FormData) => Promise<void>
    readonly token: string
    readonly next: string | undefined
}

export function AutoSignIn({ action, token, next }: AutoSignInProps) {
    const form = useRef<HTMLFormElement>(null)
    const hasSubmitted = useRef(false)

    useEffect(() => {
        if (hasSubmitted.current) {
            return
        }

        hasSubmitted.current = true
        form.current?.requestSubmit()
    }, [])

    return (
        <form ref={form} action={action} className="space-y-3">
            <input type="hidden" name="token" value={token} />
            {next === undefined ? null : <input type="hidden" name="next" value={next} />}
            <p className="text-sm text-muted" aria-live="polite">Signing you in…</p>
            <button type="submit" className="min-h-12 w-full rounded-xl border border-line bg-surface font-semibold text-ink">
                Not moving? Sign in
            </button>
        </form>
    )
}
