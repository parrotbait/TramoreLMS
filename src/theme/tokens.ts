// Created by Claude driven by Eddie Long on 2026-10-31.
//
// The only place colour values live (PLAN.md section 3a).
// Sampled from public/brand/logo-shield.png.
// Contrast: white on maroon 10.7:1. Near-black on gold 8.8:1. Never white on gold (2.0:1).

export const colours = {
    maroon: '#830000',
    gold: '#EBAD0A',
    onMaroon: '#FFFFFF',
    onGold: '#1A1A1A',
    surface: '#FFFFFF',
    text: '#1A1A1A',
    muted: '#6B6B6B',
} as const

export const brand = {
    clubName: 'Tramore Athletic',
    fundraisingLine: 'In aid of Tramore Athletic',
    logoPath: '/brand/logo-shield.png',
} as const
