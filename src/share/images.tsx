// Created by Claude driven by Eddie Long on 2026-11-04.
//
// The WhatsApp images, drawn with next/og (Satori). 1080 pixels wide, as tall
// as the content needs. Satori supports a subset of CSS: every box with more
// than one child is a flex box, and sizes are explicit.
//
// No emoji: they would need an emoji font fetched from a CDN at render time.

import type { ReactElement } from 'react'

import { brand, colours } from '@/theme/tokens'

import type { PicksImageModel, StatusImageModel } from './models'

export const IMAGE_WIDTH = 1080
const PADDING = 56
const HEADER_HEIGHT = 230
const FOOTER_HEIGHT = 96

/** Images as data URIs. Satori never fetches. A missing image leaves a gap. */
export interface ImageAssets {
    readonly logo: string | null
    /** A team crest by its public path, such as `/crests/arsenal.png`. */
    readonly crestOf: (publicPath: string) => string | null
}

interface Sized {
    readonly element: ReactElement
    readonly height: number
}

export function statusImage(model: StatusImageModel, assets: ImageAssets): Sized {
    const names = model.stillIn ?? []
    const columns = names.length <= 24 ? 2 : names.length <= 60 ? 3 : 4
    const nameRows = Math.ceil(names.length / columns)
    const out = model.outThisWeek ?? []

    const sections: Sized[] = [
        { height: 120, element: <Headline text={model.headline} /> },
    ]
    if (model.winnerLine !== null) {
        sections.push({ height: 110, element: <Winner text={model.winnerLine.replace(/^\p{Extended_Pictographic}\s*/u, '')} /> })
    }

    if (model.stillIn !== null && names.length > 0) {
        sections.push({ height: 70 + nameRows * 58, element: <NameGrid title="Still in" names={names} columns={columns} /> })
    }

    if (model.outThisWeek !== null && out.length > 0) {
        sections.push({ height: 70 + out.length * 56, element: <OutList players={out} /> })
    }

    if (model.outEarlier > 0) {
        sections.push({ height: 70, element: <Note text={`${model.outEarlier} out in earlier weeks`} /> })
    }

    const height = HEADER_HEIGHT + sections.reduce((sum, section) => {
        return sum + section.height
    }, 0) + FOOTER_HEIGHT + PADDING

    return {
        height,
        element: (
            <Frame>
                <Header title={model.title} subtitle={model.subtitle} logo={assets.logo} />
                <div style={{ display: 'flex', flexDirection: 'column', padding: `24px ${PADDING}px 0` }}>
                    {sections.map((section, index) => {
                        return (
                            <div key={index} style={{ display: 'flex', height: section.height }}>
                                {section.element}
                            </div>
                        )
                    })}
                </div>
                <Footer text={model.footer} />
            </Frame>
        ),
    }
}

export function picksImage(model: PicksImageModel, assets: ImageAssets): Sized {
    const most = Math.max(1, ...model.teams.map((team) => {
        return team.count
    }))
    const rowHeight = 84
    const height = HEADER_HEIGHT + 120 + Math.max(1, model.teams.length) * rowHeight + FOOTER_HEIGHT + PADDING

    return {
        height,
        element: (
            <Frame>
                <Header title={model.title} subtitle={model.subtitle} logo={assets.logo} />
                <div style={{ display: 'flex', flexDirection: 'column', padding: `24px ${PADDING}px 0` }}>
                    <div style={{ display: 'flex', height: 120 }}>
                        <Headline text={model.isRevealed ? `${model.total} picks` : 'Picks are revealed at the cut-off'} />
                    </div>
                    {model.teams.map((team) => {
                        const barWidth = Math.round((team.count / most) * 420)
                        const crest = team.crestUrl === null ? null : assets.crestOf(team.crestUrl)
                        return (
                            <div key={team.teamName} style={{ display: 'flex', alignItems: 'center', height: rowHeight, gap: 24 }}>
                                {crest === null
                                    ? <div style={{ display: 'flex', width: 60, height: 60 }} />
                                    : (
                                        // Satori only understands a plain img. next/image can't render here.
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={crest}
                                            width={60}
                                            height={60}
                                            style={{ objectFit: 'contain' }}
                                        />
                                    )}
                                <div style={{ display: 'flex', width: 360, fontSize: 34, fontWeight: 700, color: colours.text }}>
                                    {team.teamName}
                                </div>
                                <div style={{ display: 'flex', width: barWidth, height: 28, borderRadius: 14, background: colours.maroon }} />
                                <div style={{ display: 'flex', fontSize: 36, fontWeight: 700, color: colours.text }}>{String(team.count)}</div>
                            </div>
                        )
                    })}
                </div>
                <Footer text={brand.fundraisingLine} />
            </Frame>
        ),
    }
}

function Frame({ children }: { readonly children: ReactElement | readonly ReactElement[] }) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                width: IMAGE_WIDTH,
                height: '100%',
                background: colours.surface,
                fontFamily: 'sans-serif',
            }}
        >
            {children}
        </div>
    )
}

function Header({ title, subtitle, logo }: {
    readonly title: string
    readonly subtitle: string
    readonly logo: string | null
}) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 36,
                height: HEADER_HEIGHT,
                padding: `0 ${PADDING}px`,
                background: colours.maroon,
                color: colours.onMaroon,
            }}
        >
            {logo === null
                ? <div style={{ display: 'flex', width: 146, height: 148 }} />
                : (
                    // Satori only understands a plain img. next/image can't render here.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} width={146} height={148} />
                )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', fontSize: 54, fontWeight: 700 }}>{title}</div>
                <div style={{ display: 'flex', fontSize: 30, opacity: 0.9 }}>{brand.fundraisingLine}</div>
                <div style={{ display: 'flex', marginTop: 10, fontSize: 32, fontWeight: 700, color: colours.gold }}>{subtitle}</div>
            </div>
        </div>
    )
}

function Headline({ text }: { readonly text: string }) {
    return <div style={{ display: 'flex', alignItems: 'center', fontSize: 58, fontWeight: 700, color: colours.text }}>{text}</div>
}

function Winner({ text }: { readonly text: string }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                height: 90,
                padding: '0 28px',
                borderRadius: 24,
                background: colours.gold,
                color: colours.onGold,
                fontSize: 40,
                fontWeight: 700,
            }}
        >
            {`WINNER · ${text}`}
        </div>
    )
}

function NameGrid({ title, names, columns }: {
    readonly title: string
    readonly names: readonly string[]
    readonly columns: number
}) {
    const width = Math.floor((IMAGE_WIDTH - PADDING * 2) / columns)
    return (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            <SectionTitle text={title} />
            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                {names.map((name) => {
                    return (
                        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 14, width, height: 58 }}>
                            <div style={{ display: 'flex', width: 18, height: 18, borderRadius: 9, background: colours.gold }} />
                            <div style={{ display: 'flex', fontSize: 32, color: colours.text }}>{name}</div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function OutList({ players }: { readonly players: StatusImageModel['outThisWeek'] & object }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            <SectionTitle text="Out this week" />
            {players.map((player) => {
                const result = player.scoreLabel === null ? player.teamName : `${player.teamName} ${player.scoreLabel}`
                return (
                    <div key={player.name} style={{ display: 'flex', alignItems: 'center', gap: 14, height: 56 }}>
                        <div style={{ display: 'flex', width: 18, height: 18, borderRadius: 9, background: colours.maroon }} />
                        <div style={{ display: 'flex', fontSize: 32, color: colours.muted, textDecoration: 'line-through' }}>{player.name}</div>
                        <div style={{ display: 'flex', fontSize: 28, color: colours.muted }}>{result}</div>
                    </div>
                )
            })}
        </div>
    )
}

function Note({ text }: { readonly text: string }) {
    return <div style={{ display: 'flex', alignItems: 'center', fontSize: 30, color: colours.muted }}>{text}</div>
}

function SectionTitle({ text }: { readonly text: string }) {
    return (
        <div style={{ display: 'flex', height: 64, alignItems: 'center', fontSize: 34, fontWeight: 700, color: colours.maroon }}>
            {text}
        </div>
    )
}

function Footer({ text }: { readonly text: string }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                marginTop: 'auto',
                height: FOOTER_HEIGHT,
                padding: `0 ${PADDING}px`,
                background: colours.subtle,
                color: colours.text,
                fontSize: 28,
            }}
        >
            {text}
        </div>
    )
}
