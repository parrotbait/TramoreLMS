// Created by Claude driven by Eddie Long on 2026-11-01.

'use server'

import { redirect } from 'next/navigation'

import { requestSignInLink, verifySignInLink } from './flows'
import type { LinkPurpose } from './rules'
import { authEnvironment, clearSessionCookie, sessionCookieValue, setSessionCookie } from './session'
import { deleteSession } from './store'

export async function requestLinkAction(formData: FormData) {
    const purpose: LinkPurpose = formData.get('purpose') === 'admin' ? 'admin' : 'signin'
    const email = String(formData.get('email') ?? '')
    const next = optionalString(formData.get('next'))
    const page = purpose === 'admin' ? '/admin/signin' : '/signin'

    const result = await requestSignInLink(authEnvironment(), email, purpose, next)
    if (result.kind === 'invalidEmail') {
        redirect(`${page}?error=email`)
    }

    redirect(`${page}?sent=1`)
}

export async function verifyLinkAction(formData: FormData) {
    const token = String(formData.get('token') ?? '')
    const next = optionalString(formData.get('next'))

    const result = await verifySignInLink(authEnvironment(), token, next)
    if (result.kind === 'invalid') {
        redirect('/auth/verify?error=invalid')
    }

    await setSessionCookie(result.cookieValue, result.expiresAt)
    redirect(result.next)
}

export async function signOutAction() {
    const value = await sessionCookieValue()
    if (value !== undefined) {
        await deleteSession(authEnvironment().db, value)
    }

    await clearSessionCookie()
    redirect('/')
}

function optionalString(value: FormDataEntryValue | null): string | undefined {
    return typeof value === 'string' && value !== '' ? value : undefined
}
