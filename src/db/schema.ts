// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Database schema (PLAN.md section 4). Drizzle ORM on Postgres.
// Money is in cents. Times are timestamptz (UTC), shown in Europe/Dublin.
// Standings are never stored: they are derived by the rules engine.

import { sql } from 'drizzle-orm'
import {
    bigserial,
    boolean,
    check,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core'

const createdAt = () => {
    return timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}

const at = (name: string) => {
    return timestamp(name, { withTimezone: true })
}

export const competitionStatus = pgEnum('competition_status', [
    'draft',
    'open',
    'running',
    'finished',
])

export const fixtureState = pgEnum('fixture_state', [
    'scheduled',
    'finished',
    'postponed',
    'abandoned',
])

export const overrideKind = pgEnum('override_kind', [
    'result',
    'void',
])

export const entryStatus = pgEnum('entry_status', [
    'pending',
    'active',
    'withdrawn',
    /** The 1-hour name hold ran out before payment (Decision 18). */
    'expired',
])

export const paymentKind = pgEnum('payment_kind', [
    'entry',
    'buyback',
])

export const paymentMethod = pgEnum('payment_method', [
    'stripe',
    'cash',
    'revolut',
    'other',
])

export const paymentStatus = pgEnum('payment_status', [
    'pending',
    'paid',
    'refunded',
    'failed',
])

export const pickSource = pgEnum('pick_source', [
    'player',
    'auto',
    'autoPass',
])

export const verdict = pgEnum('verdict', [
    'through',
    'out',
])

export const linkPurpose = pgEnum('link_purpose', [
    'signin',
    'admin',
])

export const people = pgTable('person', {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Always stored lower-case. */
    email: text('email').notNull(),
    futureCommsOptIn: boolean('future_comms_opt_in').notNull().default(false),
    createdAt: createdAt(),
    /** Set when the email is removed (retention or a deletion request). */
    deletedAt: at('deleted_at'),
}, (table) => {
    return [
        uniqueIndex('person_email_key').on(table.email),
        check('person_email_lower', sql`${table.email} = lower(${table.email})`),
    ]
})

export const competitions = pgTable('competition', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** The season's starting year, for example 2026 for 2026/27. */
    season: integer('season').notNull(),
    startMatchday: integer('start_matchday').notNull(),
    finalMatchday: integer('final_matchday').notNull().default(38),
    entryFeeCents: integer('entry_fee_cents').notNull().default(1000),
    buybackFeeCents: integer('buyback_fee_cents').notNull().default(500),
    prizeCents: integer('prize_cents').notNull().default(30_000),
    entriesOpen: boolean('entries_open').notNull().default(false),
    showRaised: boolean('show_raised').notNull().default(false),
    status: competitionStatus('status').notNull().default('draft'),
    createdAt: createdAt(),
}, (table) => {
    return [
        check('competition_matchdays', sql`${table.startMatchday} between 1 and ${table.finalMatchday}`),
        check('competition_money', sql`${table.entryFeeCents} >= 0 and ${table.buybackFeeCents} >= 0 and ${table.prizeCents} >= 0`),
    ]
})

export const teams = pgTable('team', {
    id: uuid('id').primaryKey().defaultRandom(),
    competitionId: uuid('competition_id').notNull().references(() => {
        return competitions.id
    }, { onDelete: 'cascade' }),
    /** Our club name (Decision 8). Auto-assign sorts by this. Admin-editable. */
    fullName: text('full_name').notNull(),
    /** Stable id for the crest file, for example “aston-villa”. */
    slug: text('slug').notNull(),
    footballDataId: integer('football_data_id'),
}, (table) => {
    return [
        uniqueIndex('team_competition_slug_key').on(table.competitionId, table.slug),
        uniqueIndex('team_competition_name_key').on(table.competitionId, table.fullName),
    ]
})

export const weeks = pgTable('week', {
    id: uuid('id').primaryKey().defaultRandom(),
    competitionId: uuid('competition_id').notNull().references(() => {
        return competitions.id
    }, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    plMatchday: integer('pl_matchday').notNull(),
    /** Fixed when the week opens (Decision 12). */
    cutoffAt: at('cutoff_at'),
    cutoffOverridden: boolean('cutoff_overridden').notNull().default(false),
    openedAt: at('opened_at'),
    settledAt: at('settled_at'),
}, (table) => {
    return [
        uniqueIndex('week_competition_number_key').on(table.competitionId, table.number),
        uniqueIndex('week_competition_matchday_key').on(table.competitionId, table.plMatchday),
        check('week_number_positive', sql`${table.number} >= 1`),
    ]
})

export const fixtures = pgTable('fixture', {
    id: uuid('id').primaryKey().defaultRandom(),
    competitionId: uuid('competition_id').notNull().references(() => {
        return competitions.id
    }, { onDelete: 'cascade' }),
    weekId: uuid('week_id').notNull().references(() => {
        return weeks.id
    }, { onDelete: 'cascade' }),
    homeTeamId: uuid('home_team_id').notNull().references(() => {
        return teams.id
    }),
    awayTeamId: uuid('away_team_id').notNull().references(() => {
        return teams.id
    }),
    kickoffAt: at('kickoff_at').notNull(),
    /** The football-data.org match id. */
    externalId: integer('external_id').notNull(),
    state: fixtureState('state').notNull().default('scheduled'),
    homeGoals: integer('home_goals'),
    awayGoals: integer('away_goals'),
    postponedAt: at('postponed_at'),
    overrideKind: overrideKind('override_kind'),
    overrideHomeGoals: integer('override_home_goals'),
    overrideAwayGoals: integer('override_away_goals'),
    overrideReason: text('override_reason'),
    updatedAt: at('updated_at').notNull().defaultNow(),
}, (table) => {
    return [
        uniqueIndex('fixture_competition_external_key').on(table.competitionId, table.externalId),
        index('fixture_week_idx').on(table.weekId),
        check('fixture_teams_differ', sql`${table.homeTeamId} <> ${table.awayTeamId}`),
        check('fixture_finished_has_score', sql`(${table.state} = 'finished') = (${table.homeGoals} is not null and ${table.awayGoals} is not null)`),
        check('fixture_postponed_has_time', sql`(${table.state} = 'postponed') = (${table.postponedAt} is not null)`),
        check('fixture_override_score', sql`(${table.overrideKind} = 'result') = (${table.overrideHomeGoals} is not null and ${table.overrideAwayGoals} is not null)`),
        check('fixture_override_reason', sql`${table.overrideKind} is null or ${table.overrideReason} is not null`),
    ]
})

export const entries = pgTable('entry', {
    id: uuid('id').primaryKey().defaultRandom(),
    competitionId: uuid('competition_id').notNull().references(() => {
        return competitions.id
    }, { onDelete: 'cascade' }),
    personId: uuid('person_id').notNull().references(() => {
        return people.id
    }),
    displayName: text('display_name').notNull(),
    /** Lower-case, accent-free form of the name, for the uniqueness check (Decision 17). */
    displayNameKey: text('display_name_key').notNull(),
    status: entryStatus('status').notNull().default('pending'),
    /** A pending entry holds its name until this time (Decision 18). */
    holdExpiresAt: at('hold_expires_at'),
    boughtBack: boolean('bought_back').notNull().default(false),
    withdrawnFromWeek: integer('withdrawn_from_week'),
    createdAt: createdAt(),
}, (table) => {
    return [
        uniqueIndex('entry_competition_name_key')
            .on(table.competitionId, table.displayNameKey)
            .where(sql`${table.status} in ('pending', 'active')`),
        index('entry_person_idx').on(table.personId),
        check('entry_name_length', sql`char_length(${table.displayName}) between 1 and 20`),
        check('entry_pending_has_hold', sql`(${table.status} = 'pending') = (${table.holdExpiresAt} is not null)`),
    ]
})

export const payments = pgTable('payment', {
    id: uuid('id').primaryKey().defaultRandom(),
    entryId: uuid('entry_id').notNull().references(() => {
        return entries.id
    }),
    kind: paymentKind('kind').notNull(),
    method: paymentMethod('method').notNull(),
    status: paymentStatus('status').notNull().default('pending'),
    amountCents: integer('amount_cents').notNull(),
    feeCents: integer('fee_cents').notNull().default(0),
    stripeSessionId: text('stripe_session_id'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    /**
     * SHA-256 of the cookie set in the browser that started this Checkout.
     * Returning from Stripe with the matching cookie signs that browser in.
     */
    checkoutTokenHash: text('checkout_token_hash'),
    checkoutTokenUsedAt: at('checkout_token_used_at'),
    note: text('note'),
    refundedAt: at('refunded_at'),
    createdAt: createdAt(),
}, (table) => {
    return [
        uniqueIndex('payment_stripe_session_key').on(table.stripeSessionId),
        index('payment_entry_idx').on(table.entryId),
        check('payment_stripe_has_session', sql`${table.method} <> 'stripe' or ${table.stripeSessionId} is not null`),
        check('payment_amounts', sql`${table.amountCents} >= 0 and ${table.feeCents} >= 0`),
    ]
})

export const picks = pgTable('pick', {
    id: uuid('id').primaryKey().defaultRandom(),
    entryId: uuid('entry_id').notNull().references(() => {
        return entries.id
    }, { onDelete: 'cascade' }),
    weekId: uuid('week_id').notNull().references(() => {
        return weeks.id
    }, { onDelete: 'cascade' }),
    /** `null` only for an auto-pass. */
    teamId: uuid('team_id').references(() => {
        return teams.id
    }),
    source: pickSource('source').notNull(),
    updatedAt: at('updated_at').notNull().defaultNow(),
}, (table) => {
    return [
        uniqueIndex('pick_entry_week_key').on(table.entryId, table.weekId),
        uniqueIndex('pick_entry_team_key').on(table.entryId, table.teamId).where(sql`${table.teamId} is not null`),
        check('pick_pass_has_no_team', sql`(${table.source} = 'autoPass') = (${table.teamId} is null)`),
    ]
})

export const pickOverrides = pgTable('pick_override', {
    entryId: uuid('entry_id').notNull().references(() => {
        return entries.id
    }, { onDelete: 'cascade' }),
    weekId: uuid('week_id').notNull().references(() => {
        return weeks.id
    }, { onDelete: 'cascade' }),
    outcome: verdict('outcome').notNull(),
    reason: text('reason').notNull(),
    actorEmail: text('actor_email').notNull(),
    createdAt: createdAt(),
}, (table) => {
    return [
        primaryKey({ columns: [table.entryId, table.weekId] }),
    ]
})

export const magicLinks = pgTable('magic_link', {
    /** SHA-256 of the token. The token itself is only ever in the email. */
    tokenHash: text('token_hash').primaryKey(),
    personId: uuid('person_id').notNull().references(() => {
        return people.id
    }, { onDelete: 'cascade' }),
    purpose: linkPurpose('purpose').notNull(),
    expiresAt: at('expires_at').notNull(),
    usedAt: at('used_at'),
    createdAt: createdAt(),
}, (table) => {
    return [
        index('magic_link_person_idx').on(table.personId, table.createdAt),
    ]
})

export const sessions = pgTable('session', {
    /** SHA-256 of the cookie value. */
    idHash: text('id_hash').primaryKey(),
    personId: uuid('person_id').notNull().references(() => {
        return people.id
    }, { onDelete: 'cascade' }),
    isAdmin: boolean('is_admin').notNull().default(false),
    expiresAt: at('expires_at').notNull(),
    createdAt: createdAt(),
})

export const emailsSent = pgTable('email_sent', {
    entryId: uuid('entry_id').notNull().references(() => {
        return entries.id
    }, { onDelete: 'cascade' }),
    weekId: uuid('week_id').notNull().references(() => {
        return weeks.id
    }, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    sentAt: at('sent_at').notNull().defaultNow(),
}, (table) => {
    return [
        primaryKey({ columns: [table.entryId, table.weekId, table.kind] }),
    ]
})

export const alerts = pgTable('alert', {
    id: uuid('id').primaryKey().defaultRandom(),
    competitionId: uuid('competition_id').notNull().references(() => {
        return competitions.id
    }, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    /** Identifies the problem, so the tick never raises the same open alert twice. */
    key: text('key').notNull(),
    fixtureId: uuid('fixture_id').references(() => {
        return fixtures.id
    }, { onDelete: 'cascade' }),
    message: text('message').notNull(),
    resolvedAt: at('resolved_at'),
    createdAt: createdAt(),
}, (table) => {
    return [
        uniqueIndex('alert_open_key')
            .on(table.competitionId, table.key)
            .where(sql`${table.resolvedAt} is null`),
    ]
})

export const auditLog = pgTable('audit_log', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorEmail: text('actor_email').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    reason: text('reason').notNull(),
    at: at('at').notNull().defaultNow(),
}, (table) => {
    return [
        index('audit_log_target_idx').on(table.targetType, table.targetId),
    ]
})
