// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Walks the browser preview through a season without a browser, checking
// what each screen would show at each step.

import { beforeEach, describe, expect, it } from 'vitest'

import { buildPickScreen } from '@/view-models/pick-screen'
import { buildPicksReveal } from '@/view-models/picks-reveal'
import { buildStandings } from '@/view-models/standings'

import {
    advancePreview,
    getPreview,
    pickForYou,
    playToEnd,
    postponeAMatch,
    resetPreview,
    viewContextOf,
    YOU,
} from '../store'

async function pickScreen() {
    const session = await getPreview()
    return buildPickScreen(viewContextOf(session), YOU, session.timeline.weekNumber)
}

function firstAvailable(model: Awaited<ReturnType<typeof pickScreen>>) {
    const team = model.fixtures
        .flatMap((fixture) => {
            return [fixture.home, fixture.away]
        })
        .find((option) => {
            return option.state === 'available'
        })
    if (team === undefined) {
        throw new Error('No team available')
    }

    return team
}

describe('Browser preview', () => {
    beforeEach(async () => {
        await resetPreview(42)
    })

    it('opens Week 1 for picking with no pick yet', async () => {
        const model = await pickScreen()

        expect(model.weekNumber).toBe(1)
        expect(model.plMatchday).toBe(11)
        expect(model.status).toBe('open')
        expect(model.currentPick).toBeNull()
        expect(model.fixtures).toHaveLength(10)
        expect(model.cutoffLabel).toMatch(/^\w{3} \d{1,2} \w{3}, \d{2}:\d{2}$/)
    })

    it('saves a pick and lets you change it', async () => {
        const session = await getPreview()
        const first = firstAvailable(await pickScreen())

        expect(pickForYou(session, first.id)).toEqual({ ok: true })
        expect((await pickScreen()).currentPick?.teamId).toBe(first.id)

        const other = (await pickScreen()).fixtures.at(-1)?.away
        expect(other).toBeDefined()
        expect(pickForYou(session, other!.id)).toEqual({ ok: true })
        expect((await pickScreen()).currentPick?.teamId).toBe(other!.id)
    })

    it('asks you to pick again when your match is postponed', async () => {
        const session = await getPreview()
        const team = firstAvailable(await pickScreen())
        pickForYou(session, team.id)
        postponeAMatch(session)

        const model = await pickScreen()
        expect(model.needsRepick).toBe(true)
        expect(model.fixtures).toHaveLength(9)
        expect(model.postponedLabels).toHaveLength(1)
        expect(pickForYou(session, team.id)).toEqual({ ok: false, reason: 'teamNotAvailable' })
    })

    it('hides everyone’s picks until the cut-off, then reveals them', async () => {
        const session = await getPreview()

        expect(buildPicksReveal(viewContextOf(session), 1).isRevealed).toBe(false)

        await advancePreview(session)
        expect(session.phase).toBe('finalHours')
        expect((await pickScreen()).status).toBe('open')

        await advancePreview(session)
        expect(session.phase).toBe('locked')

        const reveal = buildPicksReveal(viewContextOf(session), 1)
        expect(reveal.isRevealed).toBe(true)
        expect(reveal.totalPlayers).toBe(40)

        const model = await pickScreen()
        expect(model.status).toBe('locked')
        expect(model.currentPick?.auto).toBe(true)
    })

    it('settles the week, then opens the next one', async () => {
        const session = await getPreview()
        await advancePreview(session)
        await advancePreview(session)
        await advancePreview(session)

        expect(session.phase).toBe('settled')
        const standings = buildStandings(viewContextOf(session), 30_000)
        expect(standings.lastSettledWeek).toBe(1)
        expect(standings.stillIn.length + standings.out.length).toBe(40)

        await advancePreview(session)
        expect(session.timeline.weekNumber).toBe(2)
        expect(session.phase).toBe('picking')
    })

    it('plays to the end and names a winner', async () => {
        const session = await getPreview()
        await playToEnd(session)

        const standings = buildStandings(viewContextOf(session), 30_000)
        expect(standings.winnerLine).toMatch(/^🏆 /)
        expect(['won', 'competitionOver']).toContain((await pickScreen()).status)
    })
})
