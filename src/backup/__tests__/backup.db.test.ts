// Created by Claude driven by Eddie Long on 2026-11-18.
//
// The backup against real databases. The data is exported from one, encrypted,
// decrypted, and restored into a second, fresh one. Then every table is
// compared. This is the proof that a backup can bring the site back.

import { generateKeyPairSync } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { recordAudit } from '@/admin/audit'
import { createLink } from '@/auth/store'
import { alerts, auditLog, emailsSent, entries, magicLinks, payments, picks, teams, weeks } from '@/db/schema'
import { confirmPayment, startEntry } from '@/payments/service'

import { createTestDatabase } from '../../__tests__/support/database'
import type { TestDatabase } from '../../__tests__/support/database'
import { NOW, environmentOf, fakeGateway, fakeMailer, seedCompetition } from '../../__tests__/support/payments'
import { decryptSnapshot } from '../crypto'
import { runBackup } from '../run'
import { BACKUP_TABLES, LEFT_OUT_TABLES, exportSnapshot, restoreSnapshot } from '../snapshot'
import type { BackupStore } from '../store'

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

let source: TestDatabase
let target: TestDatabase

beforeAll(async () => {
    source = await createTestDatabase()
    target = await createTestDatabase()
}, 60_000)

afterAll(async () => {
    await source.close()
    await target.close()
})

beforeEach(async () => {
    await source.reset()
    await target.reset()
})

function memoryStore() {
    const saved: { pathname: string; body: Buffer }[] = []
    const store: BackupStore = {
        save: async (pathname, body) => {
            saved.push({ pathname, body })
        },
        latest: async () => {
            return null
        },
    }

    return { saved, store }
}

/** A busy little competition: paid players, picks, an alert, an audit entry, an email record, a sign-in link. */
async function seedBusySeason() {
    const { db } = source
    const gateway = fakeGateway()
    const mailer = fakeMailer()
    const environment = environmentOf(db, gateway, mailer)
    const competitionId = await seedCompetition(db)

    for (const [name, email] of [['Aoife', 'aoife@example.ie'], ['Seán', 'sean@example.ie']] as const) {
        const result = await startEntry(environment, { displayName: name, email })
        if (result.kind !== 'checkout') {
            throw new Error('Expected a checkout.')
        }

        const [entry] = await db.select().from(entries).where(eq(entries.displayName, name))
        const [payment] = await db.select().from(payments).where(eq(payments.entryId, entry?.id ?? ''))
        await confirmPayment(environment, {
            kind: 'paid',
            sessionId: payment?.stripeSessionId ?? '',
            entryId: entry?.id ?? '',
            paymentKind: 'entry',
            amountCents: 1000,
            paymentIntentId: 'pi_x',
        })
    }

    const [aoife] = await db.select().from(entries).where(eq(entries.displayName, 'Aoife'))
    const [team] = await db.select().from(teams)
    const [weekOne] = await db.select().from(weeks).where(eq(weeks.number, 1))
    if (aoife === undefined || team === undefined || weekOne === undefined) {
        throw new Error('The seed should have an entry, a team and a week.')
    }

    await db.insert(picks).values({ entryId: aoife.id, weekId: weekOne.id, teamId: team.id, source: 'player' })
    await db.insert(emailsSent).values({ entryId: aoife.id, weekId: weekOne.id, kind: 'reminder' })
    await db.insert(alerts).values({ competitionId, kind: 'test', key: 'test:1', message: 'Something needs a look' })
    await recordAudit(db, {
        actorEmail: 'admin@example.ie',
        action: 'test.action',
        targetType: 'competition',
        targetId: competitionId,
        after: { note: 'ünïcode “quotes”' },
        reason: 'A test',
    })
    await createLink(db, aoife.personId, 'signin', new Date(NOW.getTime() + 60_000), NOW)

    return competitionId
}

/** Rows in a stable order, so two databases can be compared. */
function normalised(rows: readonly unknown[]): string[] {
    return rows.map((row) => {
        return JSON.stringify(row)
    }).sort()
}

describe('which tables are backed up', () => {
    it('covers every table in the database, or says on purpose that it leaves one out', async () => {
        const rows = await source.rawQuery(
            'select table_name from information_schema.tables where table_schema = \'public\' order by 1',
        )
        const real = rows.map((row) => {
            return row['table_name']
        })

        expect([...BACKUP_TABLES, ...LEFT_OUT_TABLES].sort()).toEqual(real)
    })
})

describe('exporting', () => {
    it('leaves out the sign-in tokens', async () => {
        await seedBusySeason()

        const snapshot = await exportSnapshot(source.db, NOW)

        expect(Object.keys(snapshot.tables).sort()).toEqual([...BACKUP_TABLES].sort())
        const [link] = await source.db.select().from(magicLinks)
        expect(link?.tokenHash).toBeTruthy()
        expect(JSON.stringify(snapshot)).not.toContain(link?.tokenHash ?? 'missing')
    })

    it('counts every table, and the counts match the rows', async () => {
        await seedBusySeason()

        const snapshot = await exportSnapshot(source.db, NOW)

        for (const table of BACKUP_TABLES) {
            expect(snapshot.counts[table]).toBe(snapshot.tables[table].length)
        }

        expect(snapshot.counts.person).toBe(2)
        expect(snapshot.counts.payment).toBe(2)
        expect(snapshot.counts.pick).toBe(1)
        expect(snapshot.counts.week).toBe(2)
    })

    it('works on an empty database', async () => {
        const snapshot = await exportSnapshot(source.db, NOW)

        expect(Object.values(snapshot.counts).every((total) => {
            return total === 0
        })).toBe(true)
    })
})

describe('a whole backup, restored into a fresh database', () => {
    it('brings back every row of every table exactly', async () => {
        await seedBusySeason()
        const { saved, store } = memoryStore()

        await runBackup({ db: source.db, store, publicKeyPem: publicKey, now: NOW })
        const snapshot = decryptSnapshot(saved[0]?.body.toString('utf8') ?? '', privateKey)
        const restored = await restoreSnapshot(target.db, snapshot)
        const again = await exportSnapshot(target.db, NOW)
        const original = await exportSnapshot(source.db, NOW)

        for (const table of BACKUP_TABLES) {
            expect(restored[table]).toBe(original.counts[table])
            expect(normalised(again.tables[table])).toEqual(normalised(original.tables[table]))
        }

        expect(restored.person).toBe(2)
    })

    it('keeps the database’s own safety rules working after a restore', async () => {
        await seedBusySeason()
        const snapshot = await exportSnapshot(source.db, NOW)
        await restoreSnapshot(target.db, snapshot)

        const [pending] = await target.db.select().from(entries).where(eq(entries.displayName, 'Aoife'))
        await target.db.delete(payments).where(eq(payments.entryId, pending?.id ?? ''))
            .then(() => {
                return 'deleted'
            }, (error: unknown) => {
                return error instanceof Error ? String(error.cause) : String(error)
            })
            .then((outcome) => {
                expect(outcome).toMatch(/no paid entry payment/)
            })
    })

    it('lets new audit entries be written after a restore, without clashing with restored ones', async () => {
        const competitionId = await seedBusySeason()
        await restoreSnapshot(target.db, await exportSnapshot(source.db, NOW))
        const before = await target.db.select().from(auditLog)

        await recordAudit(target.db, {
            actorEmail: 'admin@example.ie',
            action: 'after.restore',
            targetType: 'competition',
            targetId: competitionId,
            reason: 'First entry after the restore',
        })

        const after = await target.db.select().from(auditLog)
        expect(after).toHaveLength(before.length + 1)
        const newest = after.find((row) => {
            return row.action === 'after.restore'
        })
        expect(newest?.id).toBeGreaterThan(Math.max(...before.map((row) => {
            return row.id
        })))
    })

    it('restores an empty backup into an empty database', async () => {
        const snapshot = await exportSnapshot(source.db, NOW)

        const restored = await restoreSnapshot(target.db, snapshot)

        expect(Object.values(restored).every((total) => {
            return total === 0
        })).toBe(true)
    })
})

describe('restoring safely', () => {
    it('refuses a database that already has data, and changes nothing in it', async () => {
        await seedBusySeason()
        const snapshot = await exportSnapshot(source.db, NOW)
        await restoreSnapshot(target.db, snapshot)
        const before = await exportSnapshot(target.db, NOW)

        await expect(restoreSnapshot(target.db, snapshot)).rejects.toThrow(/already has rows/)

        const after = await exportSnapshot(target.db, NOW)
        for (const table of BACKUP_TABLES) {
            expect(after.counts[table]).toBe(before.counts[table])
        }
    })

    it('refuses a backup from a different version of the database', async () => {
        const snapshot = await exportSnapshot(source.db, NOW)

        await expect(restoreSnapshot(target.db, { ...snapshot, migrations: snapshot.migrations + 1 }))
            .rejects.toThrow(/migrations/)
    })

    it('refuses something that is not a backup', async () => {
        const snapshot = await exportSnapshot(source.db, NOW)

        await expect(restoreSnapshot(target.db, { ...snapshot, version: 2 } as never))
            .rejects.toThrow(/not a Last Man Standing backup/)
    })

    it('is all or nothing: a failure part-way leaves the target empty', async () => {
        await seedBusySeason()
        const snapshot = await exportSnapshot(source.db, NOW)
        const broken = {
            ...snapshot,
            tables: { ...snapshot.tables, audit_log: [{ id: 1, not_a_real_column_value: 'x', at: 'not a date' }] },
        }

        await expect(restoreSnapshot(target.db, broken)).rejects.toThrow()

        const after = await exportSnapshot(target.db, NOW)
        expect(Object.values(after.counts).every((total) => {
            return total === 0
        })).toBe(true)
    })
})

describe('runBackup', () => {
    it('saves one encrypted file with a dated name, and no readable personal data', async () => {
        await seedBusySeason()
        const { saved, store } = memoryStore()

        const report = await runBackup({ db: source.db, store, publicKeyPem: publicKey, now: NOW })

        expect(saved).toHaveLength(1)
        expect(saved[0]?.pathname).toBe('backups/lms-20261110T120000Z.json')
        expect(report.pathname).toBe(saved[0]?.pathname)
        expect(report.bytes).toBe(saved[0]?.body.length)
        expect(report.counts.person).toBe(2)
        const text = saved[0]?.body.toString('utf8') ?? ''
        expect(text).not.toContain('aoife@example.ie')
        expect(text).not.toContain('Aoife')
    })

    it('fails loudly, and saves nothing, if the public key is wrong', async () => {
        const { saved, store } = memoryStore()

        await expect(runBackup({ db: source.db, store, publicKeyPem: 'not a key', now: NOW })).rejects.toThrow()

        expect(saved).toEqual([])
    })

    it('fails loudly if the store cannot save', async () => {
        const store: BackupStore = {
            save: async () => {
                throw new Error('Blob is down')
            },
            latest: async () => {
                return null
            },
        }

        await expect(runBackup({ db: source.db, store, publicKeyPem: publicKey, now: NOW })).rejects.toThrow('Blob is down')
    })
})
