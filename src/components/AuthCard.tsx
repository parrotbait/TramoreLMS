// Created by Claude driven by Eddie Long on 2026-11-01.
//
// The card used by the sign-in pages: crest, title, then the content.

import Image from 'next/image'
import type { ReactNode } from 'react'

import { brand } from '@/theme/tokens'

export function AuthCard({ title, children }: { readonly title: string; readonly children: ReactNode }) {
    return (
        <main className="flex min-h-dvh items-start justify-center bg-subtle px-4 py-10">
            <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-surface shadow-sm">
                <header className="flex items-center gap-3 bg-maroon px-5 py-4 text-on-maroon">
                    <Image src={brand.logoPath} alt={`${brand.clubName} crest`} width={40} height={41} priority />
                    <span>
                        <span className="block font-bold leading-tight">Last Man Standing</span>
                        <span className="block text-xs opacity-90">{brand.fundraisingLine}</span>
                    </span>
                </header>
                <section className="space-y-4 px-5 py-5">
                    <h1 className="text-xl font-bold">{title}</h1>
                    {children}
                </section>
            </div>
        </main>
    )
}

export function SignInForm({ action, purpose, next, buttonLabel }: {
    readonly action: (formData: FormData) => Promise<void>
    readonly purpose: 'signin' | 'admin'
    readonly next?: string | undefined
    readonly buttonLabel: string
}) {
    return (
        <form action={action} className="space-y-3">
            <input type="hidden" name="purpose" value={purpose} />
            {next === undefined ? null : <input type="hidden" name="next" value={next} />}
            <label className="block text-sm font-semibold" htmlFor="email">Email address</label>
            <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                className="min-h-12 w-full rounded-xl border border-line px-3 text-base"
            />
            <button type="submit" className="min-h-12 w-full rounded-xl bg-maroon font-bold text-on-maroon">
                {buttonLabel}
            </button>
        </form>
    )
}
