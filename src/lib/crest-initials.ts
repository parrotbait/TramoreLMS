// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Safe to use in the browser. The crest file index is in crests.ts (server only).

/** For example “AV” for Aston Villa, “ARS” for Arsenal. Used when there is no crest file. */
export function teamInitials(name: string): string {
    const words = name.replace(/&/g, ' ').split(/\s+/).filter((word) => {
        return word.length > 0 && word.toLowerCase() !== 'and'
    })

    if (words.length === 1) {
        return (words[0] ?? '').slice(0, 3).toUpperCase()
    }

    return words
        .slice(0, 3)
        .map((word) => {
            return word[0] ?? ''
        })
        .join('')
        .toUpperCase()
}
