// Created by Claude driven by Eddie Long on 2026-11-04.
//
// The audit log (Decision 7b): who changed what, when, from what, to what,
// and why. Written in the same transaction as the change itself.

import type { Executor } from '@/db/load'
import { auditLog } from '@/db/schema'

export interface AuditEntry {
    readonly actorEmail: string
    readonly action: string
    readonly targetType: string
    readonly targetId: string
    readonly before?: unknown
    readonly after?: unknown
    readonly reason: string
}

export async function recordAudit(db: Executor, entry: AuditEntry) {
    await db.insert(auditLog).values({
        actorEmail: entry.actorEmail,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        before: entry.before ?? null,
        after: entry.after ?? null,
        reason: entry.reason,
    })
}

/** Overrides and withdrawals need a reason. Returns it trimmed, or `null` if blank. */
export function requiredReason(value: FormDataEntryValue | null): string | null {
    const reason = typeof value === 'string' ? value.trim() : ''
    return reason === '' ? null : reason.slice(0, 500)
}
