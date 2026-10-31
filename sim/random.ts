// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Seeded random numbers (mulberry32). The same seed gives the same season,
// so any odd result can be replayed exactly.

export class Random {
    private state: number

    constructor(seed: number) {
        this.state = seed >>> 0
    }

    /** A number in [0, 1). */
    next(): number {
        this.state = (this.state + 0x6D2B79F5) >>> 0
        let value = this.state
        value = Math.imul(value ^ (value >>> 15), value | 1)
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61)

        return ((value ^ (value >>> 14)) >>> 0) / 4294967296
    }

    chance(probability: number): boolean {
        return this.next() < probability
    }

    /** An integer in [min, max]. */
    int(min: number, max: number): number {
        return min + Math.floor(this.next() * (max - min + 1))
    }

    choose<T>(items: readonly T[]): T {
        const item = items[Math.floor(this.next() * items.length)]
        if (item === undefined) {
            throw new Error('Cannot choose from an empty list')
        }

        return item
    }

    /** Chooses with probability proportional to each weight. */
    chooseWeighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
        const total = items.reduce((sum, item) => {
            return sum + weightOf(item)
        }, 0)
        let roll = this.next() * total

        for (const item of items) {
            roll -= weightOf(item)
            if (roll < 0) {
                return item
            }
        }

        return this.choose(items)
    }
}
