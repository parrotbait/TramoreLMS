// Created by Claude driven by Eddie Long on 2026-11-22.

import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config'

describe('security headers', () => {
    it('are set for every page', async () => {
        const rules = await nextConfig.headers?.()

        expect(rules).toHaveLength(1)
        expect(rules?.[0]?.source).toBe('/:path*')
    })

    it('stop the site being shown inside another site', async () => {
        const headers = new Map((await nextConfig.headers?.())?.[0]?.headers.map((header) => {
            return [header.key, header.value] as const
        }))

        expect(headers.get('X-Frame-Options')).toBe('DENY')
        expect(headers.get('Content-Security-Policy')).toContain('frame-ancestors \'none\'')
    })

    it('stop browsers guessing file types, and keep addresses with sign-in codes from other sites', async () => {
        const headers = new Map((await nextConfig.headers?.())?.[0]?.headers.map((header) => {
            return [header.key, header.value] as const
        }))

        expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
        expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    })

    it('do not limit scripts or forms, which could break the pay page or the pages themselves', async () => {
        const policy = (await nextConfig.headers?.())?.[0]?.headers.find((header) => {
            return header.key === 'Content-Security-Policy'
        })?.value ?? ''

        expect(policy).not.toContain('script-src')
        expect(policy).not.toContain('default-src')
        expect(policy).not.toContain('form-action')
    })
})
