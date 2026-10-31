// Created by Claude driven by Eddie Long on 2026-10-31.

/** “Brighton & Hove Albion” → “brighton-and-hove-albion”. Used for crest file names. */
export function slug(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
}
