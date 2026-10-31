// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Display names are unique within a competition, ignoring case and accents
// (Decision 17). “Seán M” and “sean m” are the same name.

/** The form stored in entry.display_name_key and checked for uniqueness. */
export function displayNameKey(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
}
