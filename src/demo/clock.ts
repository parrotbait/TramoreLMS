// Created by Claude driven by Eddie Long on 2026-11-04.
//
// What time it is for a competition. A demo runs on its own clock, which the
// admin moves on with Next step. Every other competition uses real time.
// Anything that reads the time for a competition's game goes through here.

export interface ClockedCompetition {
    readonly isDemo: boolean
    readonly demoNow: Date | null
}

export function competitionNow(competition: ClockedCompetition, realNow: Date): Date {
    if (!competition.isDemo || competition.demoNow === null) {
        return realNow
    }

    return competition.demoNow
}
