// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Who has their email removed (Decision 17, PLAN.md section 6 step 8).
// Pure, so it is tested.
//
// A person's email goes 90 days after the last of their competitions ends.
// Admins are kept.
// A competition ends when it is finished. The end time is when its last
// week settled.

const DAY_MS = 24 * 60 * 60 * 1000

export const RETENTION_DAYS = 90

export interface RetentionPerson {
    readonly isAdmin: boolean
    /** One per competition they entered. `null` while it hasn't ended. */
    readonly competitionEnds: readonly (Date | null)[]
}

export function isDueForRemoval(person: RetentionPerson, now: Date): boolean {
    if (person.isAdmin || person.competitionEnds.length === 0) {
        return false
    }

    return person.competitionEnds.every((end) => {
        return end !== null && now.getTime() - end.getTime() >= RETENTION_DAYS * DAY_MS
    })
}
