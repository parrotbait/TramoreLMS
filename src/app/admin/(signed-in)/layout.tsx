// Created by Claude driven by Eddie Long on 2026-11-04.
//
// The admin area. Every page below is checked for an admin on the server,
// here and again in each action (Decision 10).

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Suspense } from 'react'

import { requireAdmin } from '@/admin/guard'
import { signOutAction } from '@/auth/actions'
import { AdminNotice } from '@/components/admin/AdminNotice'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { readonly children: ReactNode }) {
    const admin = await requireAdmin()

    return (
        <div className="min-h-dvh bg-subtle">
            <header className="bg-maroon text-on-maroon">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <Link href="/admin" className="font-bold">Last Man Standing · Admin</Link>
                    <nav className="flex gap-3 text-sm">
                        <Link href="/admin" className="hover:underline">Competitions</Link>
                        <Link href="/admin/alerts" className="hover:underline">Alerts</Link>
                        <Link href="/admin/audit" className="hover:underline">Audit log</Link>
                        <Link href="/admin/demo" className="hover:underline">Demo</Link>
                    </nav>
                    <form action={signOutAction} className="ml-auto flex items-center gap-2 text-xs">
                        <span className="opacity-90">{admin.email}</span>
                        <button type="submit" className="rounded-lg border border-on-maroon/40 px-2 py-1 font-semibold">Sign out</button>
                    </form>
                </div>
            </header>
            <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">
                <Suspense>
                    <AdminNotice />
                </Suspense>
                {children}
            </main>
        </div>
    )
}
