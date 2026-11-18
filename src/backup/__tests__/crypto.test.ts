// Created by Claude driven by Eddie Long on 2026-11-18.

import { generateKeyPairSync } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { decryptSnapshot, encryptSnapshot, normalisePem, readHeader } from '../crypto'
import type { BackupSnapshot } from '../snapshot'

function keyPair() {
    return generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
}

const counts = {
    person: 1,
    competition: 0,
    team: 0,
    week: 0,
    fixture: 0,
    entry: 0,
    payment: 0,
    pick: 0,
    pick_override: 0,
    email_sent: 0,
    alert: 0,
    audit_log: 0,
}

const snapshot: BackupSnapshot = {
    format: 'lms-backup',
    version: 1,
    createdAt: '2026-11-18T03:17:00.000Z',
    migrations: 8,
    counts,
    tables: {
        person: [{ id: 'p1', email: 'secret.player@example.ie' }],
        competition: [],
        team: [],
        week: [],
        fixture: [],
        entry: [],
        payment: [],
        pick: [],
        pick_override: [],
        email_sent: [],
        alert: [],
        audit_log: [],
    },
}

describe('backup encryption', () => {
    const { publicKey, privateKey } = keyPair()

    it('gives back exactly what went in, using the private key', () => {
        const file = encryptSnapshot(snapshot, publicKey)

        expect(decryptSnapshot(file, privateKey)).toEqual(snapshot)
    })

    it('hides the data: the file never contains the player’s email', () => {
        const file = encryptSnapshot(snapshot, publicKey)

        expect(file).not.toContain('secret.player')
        expect(file).not.toContain('example.ie')
    })

    it('shows the date and counts without any key, for the admin page', () => {
        const header = readHeader(encryptSnapshot(snapshot, publicKey))

        expect(header.createdAt).toBe('2026-11-18T03:17:00.000Z')
        expect(header.counts.person).toBe(1)
    })

    it('makes a different file every time, even for the same data', () => {
        expect(encryptSnapshot(snapshot, publicKey)).not.toBe(encryptSnapshot(snapshot, publicKey))
    })

    it('cannot be opened with a different private key', () => {
        const file = encryptSnapshot(snapshot, publicKey)

        expect(() => {
            return decryptSnapshot(file, keyPair().privateKey)
        }).toThrow('cannot be opened')
    })

    it('notices if the encrypted data was changed', () => {
        const envelope = JSON.parse(encryptSnapshot(snapshot, publicKey)) as { data: string }
        const bytes = Buffer.from(envelope.data, 'base64')
        bytes[0] = (bytes[0] ?? 0) ^ 1
        envelope.data = bytes.toString('base64')

        expect(() => {
            return decryptSnapshot(JSON.stringify(envelope), privateKey)
        }).toThrow('cannot be opened')
    })

    it('notices if the date or counts in the header were changed', () => {
        const envelope = JSON.parse(encryptSnapshot(snapshot, publicKey)) as { createdAt: string }
        envelope.createdAt = '2030-01-01T00:00:00.000Z'

        expect(() => {
            return decryptSnapshot(JSON.stringify(envelope), privateKey)
        }).toThrow('cannot be opened')
    })

    it('accepts a key whose line breaks were saved as \\n in an environment variable', () => {
        const squashed = publicKey.trim().replace(/\n/g, '\\n')

        expect(squashed).not.toContain('\n')
        expect(normalisePem(squashed)).toBe(publicKey.trim())
        expect(decryptSnapshot(encryptSnapshot(snapshot, squashed), privateKey)).toEqual(snapshot)
    })

    it('rejects a file that is not a backup', () => {
        expect(() => {
            return decryptSnapshot('{"hello":"world"}', privateKey)
        }).toThrow('not a Last Man Standing backup')
        expect(() => {
            return readHeader('[]')
        }).toThrow('not a Last Man Standing backup')
    })
})
