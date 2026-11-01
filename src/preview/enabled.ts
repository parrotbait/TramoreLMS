// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Kept apart from the preview store, so pages that only need to know whether
// the preview is on do not pull in the simulator.

export function isPreviewEnabled(): boolean {
    return process.env.NODE_ENV !== 'production' || process.env['ENABLE_PREVIEW'] === 'true'
}
