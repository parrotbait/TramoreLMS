// Created by Claude driven by Eddie Long on 2026-11-18.
//
// Encrypts a backup so the file in storage is useless without the private key,
// which is kept offline and never on the server.
//
//   1. The snapshot is gzipped.
//   2. A fresh random AES-256-GCM key encrypts it.
//   3. That key is wrapped with the RSA public key (RSA-OAEP, SHA-256).
//
// The server holds only the public key, so a stolen server can write backups
// but never read them. The date and row counts stay readable in the file's
// header, so the admin page can show how fresh the last backup is. The header
// is tied to the encrypted data, so editing it is detected when decrypting.

import {
    constants,
    createCipheriv,
    createDecipheriv,
    privateDecrypt,
    publicEncrypt,
    randomBytes,
} from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'

import type { BackupSnapshot, BackupTable } from './snapshot'

export interface BackupHeader {
    readonly format: 'lms-backup'
    readonly version: 1
    readonly createdAt: string
    readonly counts: Readonly<Record<BackupTable, number>>
}

interface Envelope extends BackupHeader {
    /** The AES key, wrapped with the RSA public key. Base64. */
    readonly key: string
    readonly iv: string
    readonly tag: string
    readonly data: string
}

const ENCRYPTION = 'aes-256-gcm'

/** PEM text kept in an environment variable often has its line breaks written as \n. */
export function normalisePem(value: string): string {
    return value.trim().replace(/\\n/g, '\n')
}

function headerOf(snapshot: Pick<BackupSnapshot, 'format' | 'version' | 'createdAt' | 'counts'>): BackupHeader {
    return {
        format: snapshot.format,
        version: snapshot.version,
        createdAt: snapshot.createdAt,
        counts: snapshot.counts,
    }
}

/** The text that is checked on decrypt. The key order is fixed, so it is the same every time. */
function authenticatedText(header: BackupHeader): Buffer {
    return Buffer.from(JSON.stringify({
        format: header.format,
        version: header.version,
        createdAt: header.createdAt,
        counts: header.counts,
    }))
}

export function encryptSnapshot(snapshot: BackupSnapshot, publicKeyPem: string): string {
    const header = headerOf(snapshot)
    const aesKey = randomBytes(32)
    const iv = randomBytes(12)
    const cipher = createCipheriv(ENCRYPTION, aesKey, iv)
    cipher.setAAD(authenticatedText(header))
    const data = Buffer.concat([cipher.update(gzipSync(JSON.stringify(snapshot))), cipher.final()])

    const wrapped = publicEncrypt(
        { key: normalisePem(publicKeyPem), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        aesKey,
    )

    const envelope: Envelope = {
        ...header,
        key: wrapped.toString('base64'),
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: data.toString('base64'),
    }

    return JSON.stringify(envelope)
}

/** Reads the date and counts without the private key. */
export function readHeader(envelopeText: string): BackupHeader {
    return headerOf(parseEnvelope(envelopeText))
}

/** Throws if the key is wrong or the file was changed at all. */
export function decryptSnapshot(envelopeText: string, privateKeyPem: string): BackupSnapshot {
    const envelope = parseEnvelope(envelopeText)

    try {
        const aesKey = privateDecrypt(
            { key: normalisePem(privateKeyPem), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
            Buffer.from(envelope.key, 'base64'),
        )
        const decipher = createDecipheriv(ENCRYPTION, aesKey, Buffer.from(envelope.iv, 'base64'))
        decipher.setAAD(authenticatedText(envelope))
        decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
        const compressed = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()])

        return JSON.parse(gunzipSync(compressed).toString('utf8')) as BackupSnapshot
    } catch {
        // The library's own messages are cryptic. The two causes are the same to the reader.
        throw new Error('This backup cannot be opened. The private key is wrong, or the file was changed.')
    }
}

function parseEnvelope(text: string): Envelope {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('This is not a backup file.')
    }

    const envelope = parsed as Partial<Envelope>
    if (
        envelope.format !== 'lms-backup'
        || envelope.version !== 1
        || typeof envelope.createdAt !== 'string'
        || envelope.counts === undefined
        || typeof envelope.key !== 'string'
        || typeof envelope.iv !== 'string'
        || typeof envelope.tag !== 'string'
        || typeof envelope.data !== 'string'
    ) {
        throw new Error('This is not a Last Man Standing backup this version can read.')
    }

    return envelope as Envelope
}
