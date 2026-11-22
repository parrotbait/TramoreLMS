// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Shows “Closes in 5h 12m” in the last 24 hours before the cut-off. In the last
// hour it says “Last chance” and pulses. When it reaches zero it tells the page,
// which reloads, so a page left open does not keep offering picks that are closed.
// `nowIso` is the server's time, so the countdown also works for the
// preview's simulated clock.

'use client'

import { useEffect, useState } from 'react'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

interface CountdownProps {
    readonly cutoffIso: string
    readonly nowIso: string
    /** Called once, when the countdown reaches zero while it is being watched. */
    readonly onElapsed?: () => void
}

export function Countdown({ cutoffIso, nowIso, onElapsed }: CountdownProps) {
    const [remainingMs, setRemainingMs] = useState(() => {
        return Date.parse(cutoffIso) - Date.parse(nowIso)
    })

    useEffect(() => {
        const startedAt = Date.now()
        const startRemaining = Date.parse(cutoffIso) - Date.parse(nowIso)
        setRemainingMs(startRemaining)
        let hasElapsed = startRemaining <= 0

        const timer = setInterval(() => {
            const remaining = startRemaining - (Date.now() - startedAt)
            setRemainingMs(remaining)
            if (remaining <= 0 && !hasElapsed) {
                hasElapsed = true
                onElapsed?.()
            }
        }, 1000)

        return () => {
            clearInterval(timer)
        }
    }, [cutoffIso, nowIso, onElapsed])

    if (remainingMs <= 0 || remainingMs > DAY_MS) {
        return null
    }

    const isLastHour = remainingMs <= HOUR_MS

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full bg-maroon px-2.5 py-0.5 text-xs font-semibold text-on-maroon ${
                isLastHour ? 'animate-pulse motion-reduce:animate-none' : ''
            }`}
        >
            ⏱ {isLastHour ? 'Last chance. Closes in' : 'Closes in'} {formatRemaining(remainingMs)}
        </span>
    )
}

function formatRemaining(milliseconds: number): string {
    const totalMinutes = Math.floor(milliseconds / 60_000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    if (hours === 0) {
        const seconds = Math.floor(milliseconds / 1000) % 60
        return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
    }

    return `${hours}h ${minutes}m`
}
