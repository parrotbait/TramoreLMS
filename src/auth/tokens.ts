// Created by Claude driven by Eddie Long on 2026-11-01.
//
// Random tokens for sign-in links and session cookies. Only the SHA-256 hash
// is stored, so a copy of the database cannot be used to sign in.

import { createHash, randomBytes } from 'node:crypto'

/** 256 random bits, URL-safe. */
export function newToken(): string {
    return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
}
