// Created by Claude driven by Eddie Long on 2026-10-31.
//
// Shows “Closes in 5h 12m” in the last 24 hours before the cut-off.
// `nowIso` is the server's time, so the countdown also works for the
// preview's simulated clock.

'use client'

import { useEffect, useState } from 'react'

const DAY_MS = 24 * 60 * 60 * 1000

interface CountdownProps {
    readonly cutoffIso: string
    readonly nowIso: string
}

export function Countdown({ cutoffIso, nowIso }: CountdownProps) {
    const [remainingMs, setRemainingMs] = useState(() => {
        return Date.parse(cutoffIso) - Date.parse(nowIso)
    })

    useEffect(() => {
        const startedAt = Date.now()
        const startRemaining = Date.parse(cutoffIso) - Date.parse(nowIso)
        setRemainingMs(startRemaining)

        const timer = setInterval(() => {
            setRemainingMs(startRemaining - (Date.now() - startedAt))
        }, 1000)

        return () => {
            clearInterval(timer)
        }
    }, [cutoffIso, nowIso])

    if (remainingMs <= 0 || remainingMs > DAY_MS) {
        return null
    }

    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-maroon px-2.5 py-0.5 text-xs font-semibold text-on-maroon">
            ⏱ Closes in {formatRemaining(remainingMs)}
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
