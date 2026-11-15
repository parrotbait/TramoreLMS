// Created by Claude driven by Eddie Long on 2026-11-15.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SubmitButton } from '../SubmitButton'

// The sending state needs a form in flight, which a server render can't make.
// These check the resting state: the button works, and it already holds room
// for the pending label so the layout never moves.
describe('SubmitButton at rest', () => {
    const html = renderToStaticMarkup(
        <form>
            <SubmitButton pendingLabel="Saving…" className="rounded-lg">Save</SubmitButton>
        </form>,
    )

    it('is an enabled submit button that is not busy', () => {
        expect(html).toContain('type="submit"')
        expect(html).toContain('aria-busy="false"')
        expect(html).not.toContain('disabled')
    })

    it('shows its label and hides the pending label from view and from screen readers', () => {
        expect(html).toContain('>Save</span>')
        expect(html).toMatch(/aria-hidden="true"[^>]*class="[^"]*invisible[^"]*"[^>]*>.*Saving…/)
    })

    it('uses “Working…” when no pending label is given', () => {
        const plain = renderToStaticMarkup(<form><SubmitButton>Go</SubmitButton></form>)
        expect(plain).toContain('Working…')
    })

    it('can be disabled by the caller', () => {
        const off = renderToStaticMarkup(<form><SubmitButton disabled>Pay</SubmitButton></form>)
        expect(off).toContain('disabled')
    })

    it('keeps the caller’s classes', () => {
        expect(html).toContain('rounded-lg')
    })

    it('stops the spinner turning when reduced motion is on', () => {
        expect(html).toContain('motion-reduce:animate-none')
    })
})
