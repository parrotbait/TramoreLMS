// Created by Claude driven by Eddie Long on 2026-10-31.
//
// A club crest beside the team name. The name is always shown as text too,
// so the image is decorative and hidden from screen readers.

import Image from 'next/image'

import { teamInitials } from '@/lib/crest-initials'

interface TeamCrestProps {
    readonly name: string
    readonly src: string | null
    readonly size?: number
}

export function TeamCrest({ name, src, size = 24 }: TeamCrestProps) {
    if (src === null) {
        return (
            <span
                aria-hidden="true"
                style={{ width: size, height: size, fontSize: Math.max(8, size * 0.34) }}
                className="inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-subtle font-bold text-muted"
            >
                {teamInitials(name)}
            </span>
        )
    }

    return (
        <Image
            src={src}
            alt=""
            aria-hidden="true"
            width={size}
            height={size}
            className="inline-block shrink-0 object-contain"
            style={{ width: size, height: size }}
        />
    )
}
