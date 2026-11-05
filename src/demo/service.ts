// Created by Claude driven by Eddie Long on 2026-11-04.
//
// The demo competition in the database: start it, move it on, add guests,
// and wipe it. Server only. The rules are in plan.ts.
//
// A demo never takes money and never sends game emails. Everyone in it has a
// €0 payment marked “Demo”. Bots have @demo.invalid addresses, which can't
// receive email. Humans in the demo (you and guests) get the real reminder
// email, so emails can be tried out. Wiping deletes the demo, its bots, and any guest who has
// nothing else on the site. A guest's real entries are never touched.

import { and, desc, eq, inArray, like, sql } from 'drizzle-orm'

import { parseAdminEmails } from '@/auth/rules'
import { createLink } from '@/auth/store'
import type { Database } from '@/db/client'
import { createCompetition } from '@/db/competitions'
import { toGameState } from '@/db/game-state'
import { loadCompetitionRows } from '@/db/load'
import type { Executor } from '@/db/load'
import type { CompetitionPlan } from '@/db/plan-competition'
import { competitions, entries, fixtures, payments, people, picks } from '@/db/schema'
import type { Mailer } from '@/email/mailer'
import { demoInviteEmail } from '@/email/templates'
import { computeStandings } from '@/engine'
import { sendCompetitionReminders } from '@/jobs/send-reminders'
import { ensureLocked } from '@/jobs/tick'
import { displayNameKey } from '@/lib/display-name'
import { slug } from '@/lib/slug'

import { Random } from '../../sim/random'
import cachedSeasonJson from '../../sim/fixtures/pl-2026.json'
import { playerNames } from '../../sim/season'
import { matchesFromCache } from '../../sim/season-cache'

import { competitionNow } from './clock'
import {
    afterGamesClock,
    botPicks,
    DEMO_BOTS,
    DEMO_WEEKS,
    demoFixtures,
    demoResults,
    demoStage,
    demoStartMatchday,
    pickingClock,
} from './plan'
import type { DemoStage } from './plan'

const BOT_DOMAIN = '@demo.invalid'
const DAY_MS = 24 * 60 * 60 * 1000
const DEMO_NOTE = 'Demo'

export type DemoRow = typeof competitions.$inferSelect

export interface DemoStatus {
    readonly competition: DemoRow
    readonly now: Date
    readonly stage: DemoStage
}

export async function findDemo(db: Executor): Promise<DemoRow | null> {
    const [demo] = await db
        .select()
        .from(competitions)
        .where(eq(competitions.isDemo, true))
        .orderBy(desc(competitions.createdAt))
        .limit(1)

    return demo ?? null
}

export async function demoStatus(db: Database): Promise<DemoStatus | null> {
    const demo = await findDemo(db)
    if (demo === null) {
        return null
    }

    const rows = await loadCompetitionRows(db, demo.id)
    const now = competitionNow(demo, new Date())
    const state = toGameState(rows)

    return { competition: demo, now, stage: demoStage(rows.weeks, computeStandings(state, now), now) }
}

/** Starts a demo with 20 bots and the presenter. Returns its id. */
export async function startDemo(
    db: Database,
    presenter: { readonly personId: string; readonly name: string },
    realNow: Date,
): Promise<string> {
    if (await findDemo(db) !== null) {
        throw new Error('A demo is already running. Wipe it first.')
    }

    const matches = matchesFromCache(cachedSeasonJson)
    const startMatchday = demoStartMatchday(matches, realNow)
    const planned = demoFixtures(matches, startMatchday)
    const firstKickoff = Math.min(...planned.map((fixture) => {
        return fixture.kickoffAt.getTime()
    }))

    const competitionId = await createCompetition(db, {
        name: 'Demo · Last Man Standing',
        season: 2026,
        startMatchday,
        finalMatchday: startMatchday + DEMO_WEEKS - 1,
        status: 'open',
        demo: { now: new Date(firstKickoff - 3 * DAY_MS) },
    }, planOf(planned, startMatchday))

    const random = newRandom()
    const presenterKey = displayNameKey(presenter.name)
    const botNames = playerNames(DEMO_BOTS + 1, random)
        .filter((name) => {
            return displayNameKey(name) !== presenterKey
        })
        .slice(0, DEMO_BOTS)

    await db.transaction(async (tx) => {
        await addDemoEntry(tx, competitionId, presenter.personId, presenter.name)
        for (const [index, name] of botNames.entries()) {
            const [bot] = await tx.insert(people)
                .values({ email: `bot-${index + 1}-${competitionId.slice(0, 8)}${BOT_DOMAIN}` })
                .returning({ id: people.id })
            if (bot === undefined) {
                throw new Error('Could not add a demo bot.')
            }

            await addDemoEntry(tx, competitionId, bot.id, name)
        }
    })

    await ensureLocked(db, competitionId, realNow)
    await pickForBots(db, competitionId, realNow, random)

    return competitionId
}

export interface DemoEmail {
    readonly mailer: Mailer
    readonly siteUrl: string
}

/**
 * Moves the demo on one step, then sends any reminder emails now due on the
 * demo clock. Returns how many reminders were sent.
 */
export async function nextDemoStep(db: Database, realNow: Date, email: DemoEmail): Promise<number> {
    const status = await demoStatus(db)
    if (status === null) {
        return 0
    }

    const { competition, stage } = status
    switch (stage.kind) {
        case 'over':
            return 0
        case 'picking':
            await setClock(db, competition.id, pickingClock(stage))
            await ensureLocked(db, competition.id, realNow)
            break
        case 'locked':
            await playWeek(db, competition.id, stage.weekNumber, status.now)
            await ensureLocked(db, competition.id, realNow)
            await pickForBots(db, competition.id, realNow, newRandom())
            break
    }

    const [moved] = await db.select().from(competitions).where(eq(competitions.id, competition.id))
    const gameNow = moved === undefined ? status.now : competitionNow(moved, realNow)
    const report = await sendCompetitionReminders(db, email.mailer, competition.id, gameNow, realNow, email.siteUrl)

    return report.sent
}

/** Emails a guest a sign-in link that opens the demo pick screen. */
export async function sendDemoInvite(
    db: Database,
    email: DemoEmail,
    guest: { readonly personId: string; readonly email: string; readonly name: string },
    realNow: Date,
) {
    // 24 hours, like the welcome email, as guests often open it later.
    const token = await createLink(db, guest.personId, 'signin', new Date(realNow.getTime() + DAY_MS), realNow)
    const link = new URL('/auth/verify', email.siteUrl)
    link.searchParams.set('token', token)
    link.searchParams.set('next', '/pick')

    await email.mailer.send({ to: guest.email, ...demoInviteEmail(link.toString(), guest.name) })
}

export type GuestResult =
    | { readonly kind: 'added'; readonly competitionId: string; readonly personId: string }
    | { readonly kind: 'nameTaken' }
    | { readonly kind: 'noDemo' }

/** A real person playing along. They sign in at /signin with this email. */
export async function addDemoGuest(db: Database, name: string, email: string): Promise<GuestResult> {
    const demo = await findDemo(db)
    if (demo === null) {
        return { kind: 'noDemo' }
    }

    return db.transaction(async (tx) => {
        await tx.insert(people).values({ email })
            .onConflictDoUpdate({ target: people.email, set: { deletedAt: null } })
        const [person] = await tx.select({ id: people.id }).from(people).where(eq(people.email, email))
        if (person === undefined) {
            throw new Error('Could not save the guest.')
        }

        const isAdded = await addDemoEntry(tx, demo.id, person.id, name)
        return isAdded
            ? { kind: 'added', competitionId: demo.id, personId: person.id } as const
            : { kind: 'nameTaken' } as const
    })
}

/**
 * Deletes every demo, its bots, and guests with nothing else on the site.
 * Admins are always kept. Returns how many entries were removed.
 */
export async function wipeDemo(db: Database, adminEmails: string | undefined): Promise<number> {
    const admins = parseAdminEmails(adminEmails)

    return db.transaction(async (tx) => {
        const demos = await tx.select({ id: competitions.id }).from(competitions).where(eq(competitions.isDemo, true))
        if (demos.length === 0) {
            return 0
        }

        const demoIds = demos.map((demo) => {
            return demo.id
        })
        const demoEntries = await tx
            .select({ id: entries.id, personId: entries.personId })
            .from(entries)
            .where(inArray(entries.competitionId, demoIds))
        const entryIds = demoEntries.map((entry) => {
            return entry.id
        })

        if (entryIds.length > 0) {
            await tx.delete(payments).where(inArray(payments.entryId, entryIds))
        }

        // Cascades to the weeks, fixtures, teams, entries, picks and alerts.
        await tx.delete(competitions).where(inArray(competitions.id, demoIds))
        await tx.delete(people).where(like(people.email, `%${BOT_DOMAIN}`))

        const guestIds = [...new Set(demoEntries.map((entry) => {
            return entry.personId
        }))]
        if (guestIds.length > 0) {
            const leftovers = await tx
                .select({ id: people.id, email: people.email })
                .from(people)
                .where(and(
                    inArray(people.id, guestIds),
                    sql`not exists (select 1 from ${entries} where ${entries.personId} = ${people.id})`,
                ))
            const toDelete = leftovers
                .filter((person) => {
                    return !admins.has(person.email)
                })
                .map((person) => {
                    return person.id
                })
            if (toDelete.length > 0) {
                await tx.delete(people).where(inArray(people.id, toDelete))
            }
        }

        return entryIds.length
    })
}

/** The player's buy-back button in a demo: no Stripe, a €0 payment. */
export async function recordDemoBuyback(db: Database, entryId: string) {
    await db.transaction(async (tx) => {
        await tx.insert(payments).values({
            entryId,
            kind: 'buyback',
            method: 'other',
            status: 'paid',
            amountCents: 0,
            note: DEMO_NOTE,
        })
        await tx.update(entries).set({ boughtBack: true }).where(eq(entries.id, entryId))
    })
}

/** Returns false if the name is taken in the demo. */
async function addDemoEntry(tx: Executor, competitionId: string, personId: string, name: string): Promise<boolean> {
    const [entry] = await tx.insert(entries).values({
        competitionId,
        personId,
        displayName: name,
        displayNameKey: displayNameKey(name),
        status: 'active',
    }).onConflictDoNothing().returning({ id: entries.id })
    if (entry === undefined) {
        return false
    }

    await tx.insert(payments).values({
        entryId: entry.id,
        kind: 'entry',
        method: 'other',
        status: 'paid',
        amountCents: 0,
        note: DEMO_NOTE,
    })

    return true
}

async function setClock(db: Database, competitionId: string, now: Date) {
    await db.update(competitions).set({ demoNow: now }).where(eq(competitions.id, competitionId))
}

/** Plays the week's games and moves the clock to after the last one. */
async function playWeek(db: Database, competitionId: string, weekNumber: number, now: Date) {
    await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${competitionId}))`)
        const rows = await loadCompetitionRows(tx, competitionId)
        const state = toGameState(rows)
        const weekFixtures = state.fixtures.filter((fixture) => {
            return fixture.week === weekNumber
        })
        const results = demoResults(weekFixtures, slugOfTeam(rows), newRandom())

        for (const [fixtureId, score] of results) {
            await tx.update(fixtures)
                .set({ state: 'finished', homeGoals: score.home, awayGoals: score.away, updatedAt: now })
                .where(and(eq(fixtures.id, fixtureId), sql`${fixtures.overrideKind} is null`))
        }

        await tx.update(competitions)
            .set({ demoNow: afterGamesClock(weekFixtures, now) })
            .where(eq(competitions.id, competitionId))
    })
}

/** Bots pick for the earliest week they can, once it is open. */
async function pickForBots(db: Database, competitionId: string, realNow: Date, random: Random) {
    await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${competitionId}))`)
        const rows = await loadCompetitionRows(tx, competitionId)
        const now = competitionNow(rows.competition, realNow)
        const state = toGameState(rows)
        const standings = computeStandings(state, now)
        const stage = demoStage(rows.weeks, standings, now)
        const openWeek = rows.weeks
            .filter((week) => {
                return week.cutoffAt !== null && week.cutoffAt.getTime() > now.getTime()
            })
            .sort((left, right) => {
                return left.number - right.number
            })[0]
        if (stage.kind === 'over' || openWeek === undefined) {
            return
        }

        const personIds = await botPersonIds(tx)
        const botIds = new Set(rows.entries
            .filter((entry) => {
                return personIds.has(entry.personId)
            })
            .map((entry) => {
                return entry.id
            }))
        const chosen = botPicks(state, standings, botIds, openWeek.number, now, slugOfTeam(rows), random)
        if (chosen.length === 0) {
            return
        }

        await tx.insert(picks)
            .values(chosen.map((pick) => {
                return { entryId: pick.entryId, weekId: openWeek.id, teamId: pick.teamId, source: 'player' as const, updatedAt: now }
            }))
            .onConflictDoNothing()
    })
}

async function botPersonIds(tx: Executor): Promise<ReadonlySet<string>> {
    const rows = await tx.select({ id: people.id }).from(people).where(like(people.email, `%${BOT_DOMAIN}`))
    return new Set(rows.map((row) => {
        return row.id
    }))
}

function slugOfTeam(rows: Awaited<ReturnType<typeof loadCompetitionRows>>): (teamId: string) => string {
    const slugs = new Map(rows.teams.map((team) => {
        return [team.id, team.slug] as const
    }))

    return (teamId) => {
        return slugs.get(teamId) ?? teamId
    }
}

function planOf(planned: ReturnType<typeof demoFixtures>, startMatchday: number): CompetitionPlan {
    const names = [...new Set(planned.flatMap((fixture) => {
        return [fixture.home, fixture.away]
    }))].sort((left, right) => {
        return left.localeCompare(right, 'en')
    })

    return {
        teams: names.map((fullName) => {
            return { fullName, slug: slug(fullName) }
        }),
        weeks: Array.from({ length: DEMO_WEEKS }, (_, index) => {
            return { number: index + 1, plMatchday: startMatchday + index }
        }),
        fixtures: planned.map((fixture, index) => {
            return {
                weekNumber: fixture.weekNumber,
                homeSlug: slug(fixture.home),
                awaySlug: slug(fixture.away),
                kickoffAt: fixture.kickoffAt,
                // Demo fixtures aren't in the feed. Negative ids can't clash with real ones.
                externalId: -(index + 1),
            }
        }),
    }
}

function newRandom(): Random {
    return new Random(Math.floor(Math.random() * 2 ** 32))
}
