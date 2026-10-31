// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Club names as we show and sort them (Decision 8): the full official name,
// without non-essential parts. football-data.org says "AFC Bournemouth" and
// "Arsenal FC". We say "Bournemouth" and "Arsenal".

export function canonicalTeamName(feedName: string): string {
    return feedName
        .replace(/^AFC\s+/, '')
        .replace(/\s+(A?FC)$/, '')
        .trim()
}
