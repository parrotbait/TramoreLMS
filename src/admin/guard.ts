// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Every admin page and action calls this first. Admin rights come from
// ADMIN_EMAILS, checked on every request (Decision 10).

import { redirect } from 'next/navigation'

import { currentSession } from '@/auth/session'
import type { CurrentSession } from '@/auth/session'

export async function requireAdmin(): Promise<CurrentSession> {
    const session = await currentSession()
    if (session === null || !session.isAdmin) {
        redirect('/admin/signin')
    }

    return session
}
