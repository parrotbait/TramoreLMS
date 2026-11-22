// Created by Claude driven by Eddie Long on 2026-10-31.

import type { NextConfig } from 'next'

/**
 * Headers for every page. Only the safe ones: they stop the site being shown inside another
 * site (clickjacking on the sign-in and pay pages), stop browsers guessing file types, and
 * keep the address, which can hold a sign-in code, from leaking to other sites. A stricter
 * script policy needs a nonce on every page and is not set here. Vercel already sets HSTS.
 */
const SECURITY_HEADERS = [
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
    { key: 'Content-Security-Policy', value: 'frame-ancestors \'none\'; base-uri \'self\'; object-src \'none\'' },
]

const nextConfig: NextConfig = {
    reactStrictMode: true,
    async headers() {
        return [{ source: '/:path*', headers: SECURITY_HEADERS }]
    },
    // The WhatsApp image routes read the logo and crests from disk
    // (src/share/assets.ts). Vercel doesn't put public/ in functions.
    outputFileTracingIncludes: {
        '/admin/**/share/**': ['./public/brand/*.png', './public/crests/*.png'],
    },
}

export default nextConfig
