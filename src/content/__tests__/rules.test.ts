// Created by Claude driven by Eddie Long on 2026-11-04.

import { describe, expect, it } from 'vitest'

import { rulesContent, teamOrder } from '../rules'

const settings = {
    buybackFeeCents: 500,
    prizeCents: 30_000,
    teamNames: ['Liverpool', 'Bournemouth', 'arsenal', 'Aston Villa'],
}

function allText(content: ReturnType<typeof rulesContent>): string {
    return content.sections.flatMap((section) => {
        return [section.title, ...section.lines]
    }).join('\n')
}

describe('rulesContent', () => {
    it('fills in the buy-back fee and the prize', () => {
        const text = allText(rulesContent(settings))
        expect(text).toContain('buy back in for €5.00')
        expect(text).toContain('they win €300.00')
        expect(text).toContain('they share €300.00')
    })

    it('reads as words before a competition is set up', () => {
        const text = allText(rulesContent({ buybackFeeCents: null, prizeCents: null, teamNames: [] }))
        expect(text).toContain('buy back in for a small fee')
        expect(text).toContain('they win the prize')
        expect(text).not.toContain('€')
    })

    it('lists the teams in the auto-pick order, ignoring case', () => {
        expect(rulesContent(settings).teamOrder).toEqual(['arsenal', 'Aston Villa', 'Bournemouth', 'Liverpool'])
        expect(teamOrder(['Bournemouth', 'Arsenal'])).toEqual(['Arsenal', 'Bournemouth'])
    })

    it('keeps sentences short and uses smart quotes', () => {
        const content = rulesContent(settings)
        for (const line of content.sections.flatMap((section) => {
            return section.lines
        })) {
            expect(line).not.toMatch(/'/)
            expect(line.split(' ').length).toBeLessThanOrEqual(30)
        }

        expect(content.closing).toBe('All money after the prize goes to Tramore Athletic.')
    })
})
