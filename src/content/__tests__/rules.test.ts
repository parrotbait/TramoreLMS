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

    it('makes no promise about refunds, as the organiser decides each one', () => {
        const text = allText(rulesContent(settings)).toLowerCase()

        expect(text).not.toContain('refund')
        expect(text).not.toContain('money back')
    })

    it('ends with how the game ends, with no catch-all section after it', () => {
        const titles = rulesContent(settings).sections.map((section) => {
            return section.title
        })

        expect(titles.at(-1)).toBe('How it ends')
        expect(titles).not.toContain('Anything else')
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
