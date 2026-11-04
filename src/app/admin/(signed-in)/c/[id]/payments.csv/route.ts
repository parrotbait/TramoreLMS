// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Every payment for a competition, for the club treasurer.

import { requireAdmin } from '@/admin/guard'
import { toCsv } from '@/admin/csv'
import { loadAdminCompetition } from '@/admin/load'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
    await requireAdmin()
    const { id } = await params
    const data = await loadAdminCompetition(id)
    const euro = (cents: number) => {
        return (cents / 100).toFixed(2)
    }

    const lines: (string | number | null)[][] = [[
        'Name',
        'Email',
        'Entry status',
        'Payment',
        'Method',
        'Status',
        'Amount (€)',
        'Stripe fee (€)',
        'Paid on',
        'Refunded on',
        'Stripe session',
        'Note',
    ]]
    for (const entry of data.rows.entries) {
        for (const payment of data.paymentsByEntry.get(entry.id) ?? []) {
            lines.push([
                entry.displayName,
                data.emailOf.get(entry.id) ?? '',
                entry.status,
                payment.kind === 'buyback' ? 'Buy-back' : 'Entry',
                payment.method,
                payment.status,
                euro(payment.amountCents),
                euro(payment.feeCents),
                payment.createdAt.toISOString().slice(0, 10),
                payment.refundedAt?.toISOString().slice(0, 10) ?? null,
                payment.stripeSessionId,
                payment.note,
            ])
        }
    }

    const fileName = `${data.rows.competition.name.replace(/[^\w-]+/g, '-')}-payments.csv`
    return new Response(toCsv(lines), {
        headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename="${fileName}"`,
            'cache-control': 'private, no-store',
        },
    })
}
