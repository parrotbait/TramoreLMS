// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Ids in addresses and forms come from outside, so they are checked before
// they reach the database. A bad id is a 404, never a database error.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID.test(value)
}
