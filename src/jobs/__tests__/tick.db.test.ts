// Created by Claude driven by Eddie Long on 2026-11-22.
//
// The tick, against a real database. One failing part must never stop the
// cut-off from being applied: a feed that is down, the cross-check feed that is
// down, a competition that throws, or a payment check that is slow.

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { alerts, competitions, fixtures, weeks } from '@/db/schema'
import type { FeedMatch } from '@/feeds/types'
import { reconcileCheckout, reconcilePendingCheckouts, RECONCILE_BATCH } from '@/payments/service'

import { createTestDatabase } from '../../__tests__/support/database'
import type { TestDatabase } from '../../__tests__/support/database'
import {
    NOW,
    environmentOf,
    fakeGateway,
    fakeMailer,
    seedCompetition,
} from '../../__tests__/support/payments'
import { runTick, runTickSafely } from '../tick'
import type { FeedSource } from '../tick'

let database: TestDatabase

beforeAll(async () => {
    database = await createTestDatabase()
}, 60_000)

afterAll(async () => {
    await database.close()
})

beforeEach(async () => {
    await database.reset()
})

/** The feed's version of every fixture in the database, as the main feed would send it. */
async function feedOf(
    overrides: (externalId: number) => Partial<FeedMatch> = () => ({}),
): Promise<readonly FeedMatch[]> {
    const rows = await database.db.select().from(fixtures)
    return rows.map((fixture) => {
        return {
            externalId: fixture.externalId,
            matchday: 11,
            kickoffAt: fixture.kickoffAt,
            status: 'scheduled',
            home: { name: 'Arsenal', crestUrl: null },
            away: { name: 'Chelsea', crestUrl: null },
            score: null,
            ...overrides(fixture.externalId),
        } satisfies FeedMatch
    })
}

const ticking = new Date('2026-11-20T10:00:00Z')

describe('the tick when a feed is down', () => {
    it('opens and locks weeks even when the main feed fails, and reports the failure', async () => {
        await seedCompetition(database.db)
        const feeds: FeedSource = {
            primary: async () => {
                throw new Error('football-data.org returned 503')
            },
            secondary: async () => {
                return []
            },
        }

        const { reports, failures } = await runTickSafely(database.db, ticking, feeds)

        expect(failures).toEqual([])
        expect(reports).toHaveLength(1)
        expect(reports[0]?.feed).toEqual({ error: 'football-data.org returned 503' })
        expect(reports[0]?.openedWeeks).toEqual([1])
    })

    it('still applies a postponement from the main feed when the cross-check feed is down', async () => {
        await seedCompetition(database.db)
        const feeds: FeedSource = {
            primary: async () => {
                return feedOf((externalId) => {
                    return externalId === 1 ? { status: 'postponed' } : {}
                })
            },
            secondary: async () => {
                throw new Error('FPL returned 403 Forbidden')
            },
        }

        const { reports } = await runTickSafely(database.db, ticking, feeds)

        expect(reports[0]?.feed).toEqual({ partial: 'The FPL cross-check failed: FPL returned 403 Forbidden' })
        const [postponed] = await database.db.select().from(fixtures).where(eq(fixtures.externalId, 1))
        expect(postponed?.state).toBe('postponed')
    })

    it('saves no result while the cross-check is down, as a result needs both feeds', async () => {
        await seedCompetition(database.db)
        const feeds: FeedSource = {
            primary: async () => {
                return feedOf((externalId) => {
                    return externalId === 1 ? { status: 'finished', score: { home: 2, away: 0 } } : {}
                })
            },
            secondary: async () => {
                throw new Error('FPL is down')
            },
        }

        await runTickSafely(database.db, new Date('2026-11-21T20:00:00Z'), feeds)

        const [game] = await database.db.select().from(fixtures).where(eq(fixtures.externalId, 1))
        expect(game?.state).toBe('scheduled')
    })

    it('reports a clean sync when both feeds work', async () => {
        await seedCompetition(database.db)
        const feeds: FeedSource = {
            primary: async () => {
                return feedOf()
            },
            secondary: async () => {
                return []
            },
        }

        const { reports } = await runTickSafely(database.db, ticking, feeds)

        expect(reports[0]?.feed).toBe('synced')
    })
})

describe('the tick when one competition breaks', () => {
    it('still ticks the others, and says which one failed', async () => {
        const goodId = await seedCompetition(database.db)
        const brokenId = await seedCompetition(database.db, { season: 2099 })
        const feeds: FeedSource = {
            primary: async (season) => {
                // A feed answer the tick cannot work with, for one competition only.
                return season === 2099 ? (undefined as unknown as readonly FeedMatch[]) : []
            },
            secondary: async () => {
                return []
            },
        }

        const { reports, failures } = await runTickSafely(database.db, ticking, feeds)

        expect(reports.map((report) => {
            return report.competitionId
        })).toEqual([goodId])
        expect(failures.map((failure) => {
            return failure.competitionId
        })).toEqual([brokenId])
        const [weekOne] = await database.db.select().from(weeks).where(eq(weeks.competitionId, goodId))
        expect(weekOne?.openedAt).not.toBeNull()
    })

    it('runTick still throws after trying them all, so a script sees the failure', async () => {
        await seedCompetition(database.db, { season: 2099 })
        const feeds: FeedSource = {
            primary: async () => {
                return undefined as unknown as readonly FeedMatch[]
            },
            secondary: async () => {
                return []
            },
        }

        await expect(runTick(database.db, ticking, feeds)).rejects.toThrow('Tick failed for 1 competition')
    })

    it('never ticks a demo, so a broken demo cannot affect the real game', async () => {
        const demoId = await seedCompetition(database.db)
        await database.db.update(competitions).set({ isDemo: true, demoNow: NOW, entriesOpen: false })
            .where(eq(competitions.id, demoId))

        const { reports, failures } = await runTickSafely(database.db, ticking, null)

        expect(reports).toEqual([])
        expect(failures).toEqual([])
    })
})

describe('checking payments', () => {
    it('does not ask Stripe about a session we never started', async () => {
        await seedCompetition(database.db)
        const gateway = fakeGateway()
        const environment = environmentOf(database.db, gateway, fakeMailer())

        await reconcileCheckout(environment, 'cs_live_somebody_elses')

        expect(gateway.retrievals).toEqual([])
    })

    it('checks at most a batch of pending payments, oldest first, so a flood cannot use up the tick', async () => {
        const { startEntry } = await import('@/payments/service')
        await seedCompetition(database.db)
        const gateway = fakeGateway()
        const environment = environmentOf(database.db, gateway, fakeMailer())
        for (let index = 0; index < RECONCILE_BATCH + 5; index += 1) {
            await startEntry(environment, { displayName: `Player ${index}`, email: `p${index}@example.ie` })
        }

        const { payments } = await import('@/db/schema')
        await database.db.update(payments).set({ createdAt: new Date(NOW.getTime() - 60 * 60 * 1000) })
        const report = await reconcilePendingCheckouts(environment)

        expect(report.checked).toBe(RECONCILE_BATCH)
        expect(gateway.retrievals).toHaveLength(RECONCILE_BATCH)
    })

    it('stops checking once its time is up, and leaves the rest for the next run', async () => {
        const { startEntry } = await import('@/payments/service')
        await seedCompetition(database.db)
        const gateway = fakeGateway()
        const environment = environmentOf(database.db, gateway, fakeMailer())
        await startEntry(environment, { displayName: 'Aoife', email: 'aoife@example.ie' })
        const { payments } = await import('@/db/schema')
        await database.db.update(payments).set({ createdAt: new Date(NOW.getTime() - 60 * 60 * 1000) })

        const report = await reconcilePendingCheckouts(environment, Date.now() - 1)

        expect(report.confirmed).toBe(0)
        expect(gateway.retrievals).toEqual([])
    })
})

describe('the periodic fixture check', () => {
    // 12:00 UTC is the first tick of a 6-hour window. 10:00 is not.
    const checking = new Date('2026-11-20T12:00:00Z')

    /** The feed as it would send the two seeded weeks, plus whatever extra the test adds. */
    async function seasonFeed(extra: readonly FeedMatch[] = []): Promise<readonly FeedMatch[]> {
        const rows = await database.db.select().from(fixtures)
        const teamOf = ['Arsenal', 'Chelsea', 'Everton', 'Fulham', 'Arsenal', 'Everton', 'Chelsea', 'Fulham']
        const matches = rows.map((fixture, index) => {
            return {
                externalId: fixture.externalId,
                matchday: index < 2 ? 11 : 12,
                kickoffAt: fixture.kickoffAt,
                status: 'scheduled',
                home: { name: teamOf[index * 2] ?? 'Arsenal', crestUrl: null },
                away: { name: teamOf[index * 2 + 1] ?? 'Chelsea', crestUrl: null },
                score: null,
            } satisfies FeedMatch
        })

        return [...matches, ...extra]
    }

    function feedsOf(primary: readonly FeedMatch[]): FeedSource {
        return {
            primary: async () => {
                return primary
            },
            secondary: async () => {
                return []
            },
        }
    }

    const gameWeDoNotHave: FeedMatch = {
        externalId: 99_001,
        matchday: 12,
        kickoffAt: new Date('2026-11-28T15:00:00Z'),
        status: 'scheduled',
        home: { name: 'Arsenal', crestUrl: null },
        away: { name: 'Fulham', crestUrl: null },
        score: null,
    }

    it('raises a game that is in the feed but not in our list, once, and not again on the next check', async () => {
        await seedCompetition(database.db)
        const feeds = feedsOf(await seasonFeed([gameWeDoNotHave]))

        await runTick(database.db, checking, feeds)
        await runTick(database.db, new Date(checking.getTime() + 6 * 60 * 60 * 1000), feeds)

        const rows = await database.db.select().from(alerts).where(eq(alerts.kind, 'scheduleGameAdded'))
        expect(rows).toHaveLength(1)
        expect(rows[0]?.message).toContain('Arsenal v Fulham')
    })

    it('does not run on the other ticks', async () => {
        await seedCompetition(database.db)
        const feeds = feedsOf(await seasonFeed([gameWeDoNotHave]))

        await runTick(database.db, ticking, feeds)

        expect(await database.db.select().from(alerts).where(eq(alerts.kind, 'scheduleGameAdded'))).toEqual([])
    })

    it('raises nothing for a complete list', async () => {
        await seedCompetition(database.db)

        await runTick(database.db, checking, feedsOf(await seasonFeed()))

        const rows = await database.db.select().from(alerts)
        expect(rows.filter((row) => {
            return row.kind.startsWith('schedule')
        })).toEqual([])
    })
})

describe('a game that is moved to another day', () => {
    // The seeded Week 1 has two games on Saturday 21 Nov at 15:00. The feed moves them.
    const SUNDAY = new Date('2026-11-22T15:00:00Z')
    const FRIDAY = new Date('2026-11-20T19:00:00Z')

    /** The feed, with these games at new times. The rest are as stored. */
    async function movedFeed(moves: ReadonlyMap<number, Date>): Promise<FeedSource> {
        const rows = await database.db.select().from(fixtures)
        const teamOf = ['Arsenal', 'Chelsea', 'Everton', 'Fulham', 'Arsenal', 'Everton', 'Chelsea', 'Fulham']
        const matches = rows.map((fixture, index) => {
            return {
                externalId: fixture.externalId,
                matchday: index < 2 ? 11 : 12,
                kickoffAt: moves.get(fixture.externalId) ?? fixture.kickoffAt,
                status: 'scheduled',
                home: { name: teamOf[index * 2] ?? 'Arsenal', crestUrl: null },
                away: { name: teamOf[index * 2 + 1] ?? 'Chelsea', crestUrl: null },
                score: null,
            } satisfies FeedMatch
        })

        return {
            primary: async () => {
                return matches
            },
            secondary: async () => {
                return []
            },
        }
    }

    async function weekOne() {
        const [week] = await database.db.select().from(weeks).where(eq(weeks.number, 1))
        return week
    }

    async function kickoffsOf(externalIds: readonly number[]) {
        const rows = await database.db.select().from(fixtures)
        return rows.filter((row) => {
            return externalIds.includes(row.externalId)
        }).map((row) => {
            return row.kickoffAt.toISOString()
        })
    }

    async function weekOneExternalIds() {
        const rows = await database.db.select().from(fixtures)
        return rows.slice(0, 2).map((row) => {
            return row.externalId
        })
    }

    it('saves the new day, and the cut-off follows when the week has not opened yet', async () => {
        await seedCompetition(database.db)
        const ids = await weekOneExternalIds()
        const moves = new Map(ids.map((id) => {
            return [id, SUNDAY] as const
        }))

        await runTick(database.db, ticking, await movedFeed(moves))

        expect(await kickoffsOf(ids)).toEqual(ids.map(() => {
            return SUNDAY.toISOString()
        }))
        const cutoff = (await weekOne())?.cutoffAt
        expect(cutoff?.toISOString().slice(0, 10)).toBe('2026-11-22')
    })

    it('saves the new day but keeps the cut-off, once the week has opened', async () => {
        await seedCompetition(database.db)
        const ids = await weekOneExternalIds()
        await runTick(database.db, ticking, await movedFeed(new Map()))
        const fixedCutoff = (await weekOne())?.cutoffAt
        expect(fixedCutoff).toBeInstanceOf(Date)

        const later = new Date(ticking.getTime() + 10 * 60 * 1000)
        await runTick(database.db, later, await movedFeed(new Map(ids.map((id) => {
            return [id, SUNDAY] as const
        }))))

        expect(await kickoffsOf(ids)).toEqual(ids.map(() => {
            return SUNDAY.toISOString()
        }))
        expect((await weekOne())?.cutoffAt?.toISOString()).toBe(fixedCutoff?.toISOString())
        expect(await database.db.select().from(alerts).where(eq(alerts.kind, 'kickoffBeforeCutoff'))).toEqual([])
    })

    it('raises an alert when a game moves to before the fixed cut-off', async () => {
        await seedCompetition(database.db)
        const ids = await weekOneExternalIds()
        await runTick(database.db, ticking, await movedFeed(new Map()))

        const later = new Date(ticking.getTime() + 10 * 60 * 1000)
        await runTick(database.db, later, await movedFeed(new Map([[ids[0] ?? 0, FRIDAY]])))

        expect(await kickoffsOf(ids.slice(0, 1))).toEqual([FRIDAY.toISOString()])
        const rows = await database.db.select().from(alerts).where(eq(alerts.kind, 'kickoffBeforeCutoff'))
        expect(rows).toHaveLength(1)
    })
})
