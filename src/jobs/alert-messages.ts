// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Admin alert wording. Plain sentences, with team and player names.

import type { SyncAlert } from '@/feeds/sync'
import { formatDublin } from '@/lib/format'

import type { TickAlert } from './plan-tick'

export interface AlertNames {
    readonly fixtureLabel: (fixtureId: string) => string
    readonly entryName: (entryId: string) => string
}

export interface AlertRow {
    readonly kind: string
    readonly key: string
    readonly fixtureId: string | null
    readonly message: string
}

export function syncAlertRow(alert: SyncAlert, names: AlertNames): AlertRow {
    const fixture = names.fixtureLabel(alert.fixtureId)

    switch (alert.kind) {
        case 'kickoffBeforeCutoff':
            return {
                kind: alert.kind,
                key: `${alert.kind}:${alert.fixtureId}`,
                fixtureId: alert.fixtureId,
                message: `${fixture} has moved to ${formatDublin(alert.kickoffAt)}, before the cut-off of ${formatDublin(alert.cutoffAt)}. Decide whether to move the cut-off.`,
            }
        case 'resultHeld':
            return {
                kind: alert.kind,
                key: `${alert.kind}:${alert.fixtureId}`,
                fixtureId: alert.fixtureId,
                message: alert.reason === 'scoresDisagree'
                    ? `The two feeds disagree on the score for ${fixture}. Confirm the result.`
                    : `FPL has no result for ${fixture} 6 hours after kick-off. Confirm the result.`,
            }
        case 'resultChanged':
            return {
                kind: alert.kind,
                key: `${alert.kind}:${alert.fixtureId}`,
                fixtureId: alert.fixtureId,
                message: `The result of ${fixture} changed from ${alert.from.home}-${alert.from.away} to ${alert.to.home}-${alert.to.away}. Standings have been recalculated.`,
            }
        case 'missingFromFeed':
            return {
                kind: alert.kind,
                key: `${alert.kind}:${alert.fixtureId}`,
                fixtureId: alert.fixtureId,
                message: `${fixture} is missing from football-data.org. Check the fixture.`,
            }
    }
}

export function tickAlertRow(alert: TickAlert, names: AlertNames): AlertRow {
    switch (alert.kind) {
        case 'autoPass':
            return {
                kind: alert.kind,
                key: `${alert.kind}:${alert.entryId}:${alert.weekNumber}`,
                fixtureId: null,
                message: `${names.entryName(alert.entryId)} has used every team playing in Week ${alert.weekNumber}, so they get a pass. Review it if needed.`,
            }
        case 'weekWithoutFixtures':
            return {
                kind: alert.kind,
                key: `${alert.kind}:${alert.weekNumber}`,
                fixtureId: null,
                message: `Week ${alert.weekNumber} has no fixtures, so it cannot open. Check the fixture list.`,
            }
    }
}
