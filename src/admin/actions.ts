// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Admin actions. Each one checks for an admin on the server, writes the
// change and its audit entry in one transaction, and returns to the page
// with a notice or an error.

'use server'

import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getDatabase } from '@/db/client'
import { createCompetition, replaceSchedule } from '@/db/competitions'
import { toGameState } from '@/db/game-state'
import { loadCompetitionRows } from '@/db/load'
import { planCompetition } from '@/db/plan-competition'
import {
    alerts,
    competitions,
    entries,
    fixtures,
    magicLinks,
    payments,
    people,
    pickOverrides,
    sessions,
    weeks,
} from '@/db/schema'
import { competitionNow } from '@/demo/clock'
import { computeStandings, isBuybackAvailable } from '@/engine'
import { fetchFootballData } from '@/feeds/football-data'
import { displayNameKey } from '@/lib/display-name'
import { isUuid } from '@/lib/ids'
import { nameWithSuffix, validateEntryForm } from '@/payments/entry-rules'
import { openCompetitionForEntries } from '@/payments/service'
import { gatewayFromEnv } from '@/payments/stripe'

import { recordAudit, requiredReason } from './audit'
import { parseDublinDateTime, parseEuro, parseFixtureOverride, seasonOf, withdrawalWeek } from './forms'
import { requireAdmin } from './guard'

const MANUAL_METHODS = ['cash', 'revolut', 'other'] as const

type ManualMethod = (typeof MANUAL_METHODS)[number]

// ── Competitions ─────────────────────────────────────────────────────────

export async function createCompetitionAction(formData: FormData) {
    const admin = await requireAdmin()
    const season = seasonOf(new Date())
    const name = text(formData, 'name') || `Last Man Standing ${season}/${String(season + 1).slice(2)}`
    const startMatchday = Number(text(formData, 'startMatchday'))
    const entryFeeCents = parseEuro(text(formData, 'entryFee'))
    const buybackFeeCents = parseEuro(text(formData, 'buybackFee'))
    const prizeCents = parseEuro(text(formData, 'prize'))
    if (!Number.isInteger(startMatchday) || startMatchday < 1 || startMatchday > 38) {
        back('/admin', 'error', 'The start matchday must be from 1 to 38.')
    }

    if (entryFeeCents === null || buybackFeeCents === null || prizeCents === null) {
        back('/admin', 'error', 'Enter the fees and prize in euro, for example 10 or 10.50.')
    }

    const token = process.env['FOOTBALL_DATA_TOKEN'] ?? ''
    if (token === '') {
        back('/admin', 'error', 'FOOTBALL_DATA_TOKEN is not set, so the fixtures cannot be loaded.')
    }

    const plan = planCompetition(await fetchFootballData(token, season), startMatchday)
    const db = getDatabase()
    const competitionId = await createCompetition(db, {
        name,
        season,
        startMatchday,
        entryFeeCents,
        buybackFeeCents,
        prizeCents,
    }, plan)
    await recordAudit(db, {
        actorEmail: admin.email,
        action: 'competition.create',
        targetType: 'competition',
        targetId: competitionId,
        after: { name, startMatchday, entryFeeCents, buybackFeeCents, prizeCents },
        reason: 'New competition',
    })

    back(`/admin/c/${competitionId}/settings`, 'notice', `Created “${name}”: ${plan.weeks.length} weeks, ${plan.fixtures.length} fixtures.`)
}

export async function updateCompetitionAction(competitionId: string, formData: FormData) {
    const admin = await requireAdmin()
    requireId(competitionId)
    const page = `/admin/c/${competitionId}/settings`
    const db = getDatabase()
    const rows = await loadCompetitionRows(db, competitionId)
    const before = rows.competition

    const name = text(formData, 'name') || before.name
    const entryFeeCents = parseEuro(text(formData, 'entryFee'))
    const buybackFeeCents = parseEuro(text(formData, 'buybackFee'))
    const prizeCents = parseEuro(text(formData, 'prize'))
    const showRaised = formData.get('showRaised') === 'on'
    const startMatchday = Number(text(formData, 'startMatchday') || before.startMatchday)
    if (entryFeeCents === null || buybackFeeCents === null || prizeCents === null) {
        back(page, 'error', 'Enter the fees and prize in euro, for example 10 or 10.50.')
    }

    const weekOne = rows.weeks.find((week) => {
        return week.number === 1
    })
    const weekOneCutoff = weekOne?.cutoffAt ?? null
    const hasStarted = weekOneCutoff !== null && weekOneCutoff.getTime() <= Date.now()
    const isMoneyChanged = entryFeeCents !== before.entryFeeCents
        || buybackFeeCents !== before.buybackFeeCents
        || prizeCents !== before.prizeCents
    if (hasStarted && isMoneyChanged) {
        back(page, 'error', 'The fees and prize are fixed once Week 1 has locked.')
    }

    const isStartChanged = startMatchday !== before.startMatchday
    if (isStartChanged && before.status !== 'draft') {
        back(page, 'error', 'The start matchday can only change while the competition is a draft.')
    }

    const plan = isStartChanged
        ? planCompetition(await fetchFootballData(process.env['FOOTBALL_DATA_TOKEN'] ?? '', before.season), startMatchday)
        : null

    await db.transaction(async (tx) => {
        await tx.update(competitions)
            .set({ name, entryFeeCents, buybackFeeCents, prizeCents, showRaised, startMatchday })
            .where(eq(competitions.id, competitionId))
        if (plan !== null) {
            await replaceSchedule(tx, competitionId, plan)
        }

        await recordAudit(tx, {
            actorEmail: admin.email,
            action: 'competition.update',
            targetType: 'competition',
            targetId: competitionId,
            before: pickFields(before, ['name', 'entryFeeCents', 'buybackFeeCents', 'prizeCents', 'showRaised', 'startMatchday']),
            after: { name, entryFeeCents, buybackFeeCents, prizeCents, showRaised, startMatchday },
            reason: 'Settings changed',
        })
    })

    back(page, 'notice', 'Settings saved.')
}

export async function setEntriesOpenAction(competitionId: string, open: boolean) {
    const admin = await requireAdmin()
    requireId(competitionId)
    const db = getDatabase()
    const [before] = await db.select().from(competitions).where(eq(competitions.id, competitionId))
    if (before === undefined) {
        back('/admin', 'error', 'No such competition.')
    }

    if (before.isDemo) {
        back(`/admin/c/${competitionId}/settings`, 'error', 'A demo never takes entries. Add guests on the Demo page.')
    }

    // One competition takes entries at a time, so the home page and /enter
    // can never quietly switch to a different one.
    if (open) {
        const other = await openCompetitionForEntries(db, new Date())
        if (other !== null && other.id !== competitionId) {
            back(`/admin/c/${competitionId}/settings`, 'error', `Close entries on “${other.name}” first. Only one competition can take entries at a time.`)
        }
    }

    const status = open && before.status === 'draft' ? 'open' : before.status
    await db.transaction(async (tx) => {
        await tx.update(competitions).set({ entriesOpen: open, status }).where(eq(competitions.id, competitionId))
        await recordAudit(tx, {
            actorEmail: admin.email,
            action: open ? 'competition.openEntries' : 'competition.closeEntries',
            targetType: 'competition',
            targetId: competitionId,
            before: { entriesOpen: before.entriesOpen, status: before.status },
            after: { entriesOpen: open, status },
            reason: open ? 'Entries opened' : 'Entries closed',
        })
    })

    back(`/admin/c/${competitionId}/settings`, 'notice', open ? 'Entries are open.' : 'Entries are closed.')
}

// ── Entries ──────────────────────────────────────────────────────────────

/** A player who paid cash or Revolut (Decision 18). The welcome email is not sent: they sign in from the site. */
export async function addEntryAction(competitionId: string, formData: FormData) {
    const admin = await requireAdmin()
    requireId(competitionId)
    const page = `/admin/c/${competitionId}/entries`
    const form = validateEntryForm({ displayName: text(formData, 'displayName'), email: text(formData, 'email') })
    const method = manualMethod(formData)
    if (!form.ok) {
        back(page, 'error', 'Check the name (up to 20 characters) and the email address.')
    }

    if (method === null) {
        back(page, 'error', 'Choose how they paid.')
    }

    const db = getDatabase()
    const [competition] = await db.select().from(competitions).where(eq(competitions.id, competitionId))
    if (competition === undefined) {
        back('/admin', 'error', 'No such competition.')
    }

    const amountCents = amountOrDefault(formData, competition.entryFeeCents)
    if (amountCents === null) {
        back(page, 'error', 'Enter the amount they paid in euro, for example 10 or 20.')
    }

    const added = await db.transaction(async (tx) => {
        await tx.insert(people).values({ email: form.email })
            .onConflictDoUpdate({ target: people.email, set: { deletedAt: null } })
        const [person] = await tx.select({ id: people.id }).from(people).where(eq(people.email, form.email))
        if (person === undefined) {
            throw new Error('Could not save the person.')
        }

        const [entry] = await tx.insert(entries).values({
            competitionId,
            personId: person.id,
            displayName: form.displayName,
            displayNameKey: displayNameKey(form.displayName),
            status: 'active',
        }).onConflictDoNothing().returning({ id: entries.id })
        if (entry === undefined) {
            return null
        }

        await tx.insert(payments).values({
            entryId: entry.id,
            kind: 'entry',
            method,
            status: 'paid',
            amountCents,
            note: text(formData, 'note') || null,
        })
        await recordAudit(tx, {
            actorEmail: admin.email,
            action: 'entry.addManual',
            targetType: 'entry',
            targetId: entry.id,
            after: { displayName: form.displayName, method, amountCents },
            reason: text(formData, 'note') || `Paid by ${method}`,
        })

        return entry.id
    })

    if (added === null) {
        back(page, 'error', `Someone has already entered as “${form.displayName}”.`)
    }

    back(page, 'notice', `Added “${form.displayName}”. They can sign in at /signin with ${form.email}.`)
}

export async function renameEntryAction(entryId: string, formData: FormData) {
    const admin = await requireAdmin()
    const db = getDatabase()
    const entry = await entryOrBack(entryId)
    const page = `/admin/c/${entry.competitionId}/entries`
    const reason = requiredReason(formData.get('reason'))
    const form = validateEntryForm({ displayName: text(formData, 'displayName'), email: 'admin@example.ie' })
    if (!form.ok || reason === null) {
        back(page, 'error', 'Enter a valid new name (up to 20 characters) and a reason.')
    }

    const key = displayNameKey(form.displayName)
    const [clash] = await db.select({ id: entries.id }).from(entries).where(and(
        eq(entries.competitionId, entry.competitionId),
        eq(entries.displayNameKey, key),
        inArray(entries.status, ['pending', 'active']),
        ne(entries.id, entryId),
    ))
    if (clash !== undefined) {
        back(page, 'error', `“${form.displayName}” is already taken.`)
    }

    await db.transaction(async (tx) => {
        await tx.update(entries)
            .set({ displayName: form.displayName, displayNameKey: key })
            .where(eq(entries.id, entryId))
        await recordAudit(tx, {
            actorEmail: admin.email,
            action: 'entry.rename',
            targetType: 'entry',
            targetId: entryId,
            before: { displayName: entry.displayName },
            after: { displayName: form.displayName },
            reason,
        })
    })

    back(page, 'notice', `Renamed “${entry.displayName}” to “${form.displayName}”.`)
}

/**
 * Takes an entry out of the game from the next week that has not locked.
 * Before the Week 1 cut-off, the entry fee can be refunded too (Decision 18).
 * Stripe refunds go through Stripe. Cash and Revolut refunds are recorded,
 * and the admin hands the money back.
 */
export async function withdrawEntryAction(entryId: string, formData: FormData) {
    const admin = await requireAdmin()
    const entry = await entryOrBack(entryId)
    const page = `/admin/c/${entry.competitionId}/entries`
    const reason = requiredReason(formData.get('reason'))
    if (reason === null) {
        back(page, 'error', 'Give a reason for the withdrawal.')
    }

    if (entry.status === 'withdrawn') {
        back(page, 'error', `“${entry.displayName}” is already withdrawn.`)
    }

    const db = getDatabase()
    const rows = await loadCompetitionRows(db, entry.competitionId)
    const now = competitionNow(rows.competition, new Date())
    const fromWeek = withdrawalWeek(toGameState(rows).weeks, now)
    const wantsRefund = formData.get('refund') === 'on'
    if (wantsRefund && fromWeek > 1) {
        back(page, 'error', 'Refunds are only possible before the Week 1 cut-off (rule 7).')
    }

    const paid = await db.select().from(payments).where(and(eq(payments.entryId, entryId), eq(payments.status, 'paid')))
    if (wantsRefund) {
        const gateway = gatewayFromEnv()
        for (const payment of paid) {
            if (payment.method === 'stripe' && payment.stripePaymentIntentId !== null) {
                await gateway.refund(payment.stripePaymentIntentId)
            }
        }
    }

    await db.transaction(async (tx) => {
        await tx.update(entries)
            .set({ status: 'withdrawn', holdExpiresAt: null, withdrawnFromWeek: fromWeek })
            .where(eq(entries.id, entryId))
        if (wantsRefund && paid.length > 0) {
            await tx.update(payments)
                .set({ status: 'refunded', refundedAt: now })
                .where(inArray(payments.id, paid.map((payment) => {
                    return payment.id
                })))
        }

        await recordAudit(tx, {
            actorEmail: admin.email,
            action: wantsRefund ? 'entry.withdrawAndRefund' : 'entry.withdraw',
            targetType: 'entry',
            targetId: entryId,
            before: { status: entry.status },
            after: { status: 'withdrawn', withdrawnFromWeek: fromWeek, refunded: wantsRefund },
            reason,
        })
    })

    const refundNote = wantsRefund ? ' Refunded.' : ''
    back(page, 'notice', `“${entry.displayName}” is withdrawn from Week ${fromWeek}.${refundNote}`)
}

/** A Week 1 loser who paid the buy-back by cash or Revolut (rule 3). */
export async function recordBuybackAction(entryId: string, formData: FormData) {
    const admin = await requireAdmin()
    const entry = await entryOrBack(entryId)
    const page = `/admin/c/${entry.competitionId}/entries`
    const method = manualMethod(formData)
    if (method === null) {
        back(page, 'error', 'Choose how they paid the buy-back.')
    }

    const db = getDatabase()
    const rows = await loadCompetitionRows(db, entry.competitionId)
    const now = competitionNow(rows.competition, new Date())
    const state = toGameState(rows)
    if (!isBuybackAvailable(state, computeStandings(state, now), now, entryId)) {
        back(page, 'error', `“${entry.displayName}” can’t buy back: only Week 1 losers, before the Week 2 cut-off.`)
    }

    const amountCents = amountOrDefault(formData, rows.competition.buybackFeeCents)
    if (amountCents === null) {
        back(page, 'error', 'Enter the amount they paid in euro, for example 5.')
    }

    await db.transaction(async (tx) => {
        await tx.insert(payments).values({
            entryId,
            kind: 'buyback',
            method,
            status: 'paid',
            amountCents,
            note: text(formData, 'note') || null,
        })
        await tx.update(entries).set({ boughtBack: true }).where(eq(entries.id, entryId))
        await recordAudit(tx, {
            actorEmail: admin.email,
            action: 'entry.recordBuyback',
            targetType: 'entry',
            targetId: entryId,
            after: { method, amountCents },
            reason: text(formData, 'note') || `Buy-back paid by ${method}`,
        })
    })

    back(page, 'notice', `“${entry.displayName}” is back in for Week 2.`)
}

/**
 * A deletion request (Decision 17). The email is removed and every entry
 * becomes “Removed player”, so the history still adds up. The email is not
 * copied into the audit log, which would undo the deletion.
 */
export async function removePersonAction(entryId: string, formData: FormData) {
    const admin = await requireAdmin()
    const entry = await entryOrBack(entryId)
    const page = `/admin/c/${entry.competitionId}/entries`
    const reason = requiredReason(formData.get('reason'))
    if (reason === null || text(formData, 'confirm') !== 'REMOVE') {
        back(page, 'error', 'Type REMOVE and give a reason to delete this person’s details.')
    }

    const db = getDatabase()
    await db.transaction(async (tx) => {
        const theirEntries = await tx.select().from(entries).where(eq(entries.personId, entry.personId))
        for (const theirs of theirEntries) {
            const taken = await tx.select({ key: entries.displayNameKey }).from(entries).where(and(
                eq(entries.competitionId, theirs.competitionId),
                inArray(entries.status, ['pending', 'active']),
                ne(entries.id, theirs.id),
            ))
            const takenKeys = new Set(taken.map((row) => {
                return row.key
            }))
            const name = takenKeys.has(displayNameKey('Removed player')) ? nameWithSuffix('Removed player', takenKeys) : 'Removed player'
            await tx.update(entries)
                .set({ displayName: name, displayNameKey: displayNameKey(name) })
                .where(eq(entries.id, theirs.id))
        }

        await tx.update(people).set({
            email: `removed-${entry.personId}@removed.invalid`,
            deletedAt: new Date(),
        }).where(eq(people.id, entry.personId))
        await tx.delete(sessions).where(eq(sessions.personId, entry.personId))
        await tx.delete(magicLinks).where(eq(magicLinks.personId, entry.personId))
        await recordAudit(tx, {
            actorEmail: admin.email,
            action: 'person.remove',
            targetType: 'person',
            targetId: entry.personId,
            before: { entries: theirEntries.length },
            after: { displayName: 'Removed player' },
            reason,
        })
    })

    back(page, 'notice', 'Their details are removed. Their picks stay in the history as “Removed player”.')
}

// ── Weeks ────────────────────────────────────────────────────────────────

/** A fixture override (Decision 9). The feed never undoes it. */
export async function overrideFixtureAction(fixtureId: string, formData: FormData) {
    const admin = await requireAdmin()
    requireId(fixtureId)
    const db = getDatabase()
    const [fixture] = await db
        .select({ fixture: fixtures, weekNumber: weeks.number })
        .from(fixtures)
        .innerJoin(weeks, eq(weeks.id, fixtures.weekId))
        .where(eq(fixtures.id, fixtureId))
    if (fixture === undefined) {
        back('/admin', 'error', 'No such fixture.')
    }

    const page = `/admin/c/${fixture.fixture.competitionId}/weeks/${fixture.weekNumber}`
    const input = parseFixtureOverride(text(formData, 'result'))
    const reason = requiredReason(formData.get('reason'))
    if (input === null || reason === null) {
        back(page, 'error', 'Enter a score like 2-1, or void, or clear, and a reason.')
    }

    const columns = input.kind === 'clear'
        ? { overrideKind: null, overrideHomeGoals: null, overrideAwayGoals: null, overrideReason: null }
        : input.override.kind === 'void'
            ? { overrideKind: 'void' as const, overrideHomeGoals: null, overrideAwayGoals: null, overrideReason: reason }
            : {
                overrideKind: 'result' as const,
                overrideHomeGoals: input.override.home,
                overrideAwayGoals: input.override.away,
                overrideReason: reason,
            }

    await db.transaction(async (tx) => {
        await tx.update(fixtures).set({ ...columns, updatedAt: new Date() }).where(eq(fixtures.id, fixtureId))
        if (input.kind === 'set') {
            await tx.update(alerts)
                .set({ resolvedAt: new Date() })
                .where(and(eq(alerts.fixtureId, fixtureId), isNull(alerts.resolvedAt)))
        }

        await recordAudit(tx, {
            actorEmail: admin.email,
            action: input.kind === 'clear' ? 'fixture.clearOverride' : 'fixture.override',
            targetType: 'fixture',
            targetId: fixtureId,
            before: {
                overrideKind: fixture.fixture.overrideKind,
                overrideHomeGoals: fixture.fixture.overrideHomeGoals,
                overrideAwayGoals: fixture.fixture.overrideAwayGoals,
            },
            after: columns,
            reason,
        })
    })

    back(page, 'notice', input.kind === 'clear' ? 'Override cleared. The feed result applies again.' : 'Result set. Standings are updated.')
}

/** A pick override (Decision 9): one player, one week, through or out. */
export async function overridePickAction(entryId: string, weekId: string, formData: FormData) {
    const admin = await requireAdmin()
    requireId(weekId)
    const entry = await entryOrBack(entryId)
    const db = getDatabase()
    const [week] = await db.select().from(weeks).where(eq(weeks.id, weekId))
    if (week === undefined || week.competitionId !== entry.competitionId) {
        back('/admin', 'error', 'No such week for this entry.')
    }

    const page = `/admin/c/${entry.competitionId}/weeks/${week.number}`
    const outcome = text(formData, 'outcome')
    const reason = requiredReason(formData.get('reason'))
    if ((outcome !== 'through' && outcome !== 'out' && outcome !== 'clear') || reason === null) {
        back(page, 'error', 'Choose through, out or clear, and give a reason.')
    }

    const isThisPick = and(eq(pickOverrides.entryId, entryId), eq(pickOverrides.weekId, weekId))
    const [before] = await db.select().from(pickOverrides).where(isThisPick)
    await db.transaction(async (tx) => {
        if (outcome === 'clear') {
            await tx.delete(pickOverrides).where(isThisPick)
        } else {
            await tx.insert(pickOverrides)
                .values({ entryId, weekId, outcome, reason, actorEmail: admin.email })
                .onConflictDoUpdate({
                    target: [pickOverrides.entryId, pickOverrides.weekId],
                    set: { outcome, reason, actorEmail: admin.email, createdAt: new Date() },
                })
        }

        await recordAudit(tx, {
            actorEmail: admin.email,
            action: outcome === 'clear' ? 'pick.clearOverride' : 'pick.override',
            targetType: 'entry',
            targetId: entryId,
            before: before === undefined ? null : { week: week.number, outcome: before.outcome },
            after: outcome === 'clear' ? null : { week: week.number, outcome },
            reason,
        })
    })

    back(page, 'notice', outcome === 'clear'
        ? `“${entry.displayName}” follows their result again in Week ${week.number}.`
        : `“${entry.displayName}” is ${outcome} for Week ${week.number}.`)
}

/** Moves a week’s fixed cut-off (Decision 12). The time is entered as Irish time. */
export async function overrideCutoffAction(weekId: string, formData: FormData) {
    const admin = await requireAdmin()
    requireId(weekId)
    const db = getDatabase()
    const [week] = await db.select().from(weeks).where(eq(weeks.id, weekId))
    if (week === undefined) {
        back('/admin', 'error', 'No such week.')
    }

    const page = `/admin/c/${week.competitionId}/weeks/${week.number}`
    const cutoffAt = parseDublinDateTime(text(formData, 'cutoff'))
    const reason = requiredReason(formData.get('reason'))
    if (cutoffAt === null || reason === null) {
        back(page, 'error', 'Choose a date and time, and give a reason.')
    }

    await db.transaction(async (tx) => {
        await tx.update(weeks)
            .set({ cutoffAt, cutoffOverridden: true, openedAt: week.openedAt ?? new Date() })
            .where(eq(weeks.id, weekId))
        await recordAudit(tx, {
            actorEmail: admin.email,
            action: 'week.overrideCutoff',
            targetType: 'week',
            targetId: weekId,
            before: { cutoffAt: week.cutoffAt?.toISOString() ?? null },
            after: { cutoffAt: cutoffAt.toISOString() },
            reason,
        })
    })

    back(page, 'notice', 'Cut-off moved.')
}

// ── Alerts ───────────────────────────────────────────────────────────────

export async function resolveAlertAction(alertId: string, formData: FormData) {
    const admin = await requireAdmin()
    requireId(alertId)
    const db = getDatabase()
    await db.transaction(async (tx) => {
        await tx.update(alerts)
            .set({ resolvedAt: new Date() })
            .where(and(eq(alerts.id, alertId), isNull(alerts.resolvedAt)))
        await recordAudit(tx, {
            actorEmail: admin.email,
            action: 'alert.resolve',
            targetType: 'alert',
            targetId: alertId,
            reason: requiredReason(formData.get('note')) ?? 'Resolved',
        })
    })

    back('/admin/alerts', 'notice', 'Alert resolved.')
}

// ── Helpers ──────────────────────────────────────────────────────────────

function back(path: string, kind: 'notice' | 'error', message: string): never {
    revalidatePath('/admin', 'layout')
    const separator = path.includes('?') ? '&' : '?'
    redirect(`${path}${separator}${kind}=${encodeURIComponent(message)}`)
}

function text(formData: FormData, name: string): string {
    const value = formData.get(name)
    return typeof value === 'string' ? value.trim() : ''
}

/** Ids come from the page. A bad one goes back to the start, never to the database. */
function requireId(id: string) {
    if (!isUuid(id)) {
        back('/admin', 'error', 'That link is not valid.')
    }
}

/** The amount typed in, or the usual fee if the box was left empty. */
function amountOrDefault(formData: FormData, defaultCents: number): number | null {
    const typed = text(formData, 'amount')
    return typed === '' ? defaultCents : parseEuro(typed)
}

function manualMethod(formData: FormData): ManualMethod | null {
    const value = text(formData, 'method')
    return MANUAL_METHODS.find((method) => {
        return method === value
    }) ?? null
}

async function entryOrBack(entryId: string) {
    requireId(entryId)
    const [entry] = await getDatabase().select().from(entries).where(eq(entries.id, entryId))
    if (entry === undefined) {
        back('/admin', 'error', 'No such entry.')
    }

    return entry
}

function pickFields<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
    const result = {} as Pick<T, K>
    for (const key of keys) {
        result[key] = source[key]
    }

    return result
}
