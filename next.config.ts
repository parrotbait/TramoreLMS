// Created by Claude driven by Eddie Long on 2026-10-31.

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
    reactStrictMode: true,
    // The WhatsApp image routes read the logo and crests from disk
    // (src/share/assets.ts). Vercel doesn't put public/ in functions.
    outputFileTracingIncludes: {
        '/admin/**/share/**': ['./public/brand/*.png', './public/crests/*.png'],
    },
}

export default nextConfig
