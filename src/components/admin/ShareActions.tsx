// Created by Claude driven by Eddie Long on 2026-11-04.
//
// Copy the WhatsApp reminder, and download or share the images. On a phone,
// Share opens the share sheet with WhatsApp in it.

'use client'

import { useState } from 'react'

export function CopyText({ text }: { readonly text: string }) {
    const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

    return (
        <div className="space-y-2">
            <textarea
                readOnly
                value={text}
                rows={text.split('\n').length + 1}
                className="w-full rounded-lg border border-line bg-subtle px-3 py-2 font-mono text-sm"
            />
            <button
                type="button"
                onClick={() => {
                    navigator.clipboard.writeText(text).then(() => {
                        setState('copied')
                    }, () => {
                        setState('failed')
                    })
                }}
                className="min-h-10 rounded-lg bg-maroon px-4 text-sm font-semibold text-on-maroon"
            >
                {state === 'copied' ? 'Copied ✓' : state === 'failed' ? 'Copy failed: select the text and copy it' : 'Copy reminder'}
            </button>
        </div>
    )
}

export function ImageActions({ src, fileName }: { readonly src: string; readonly fileName: string }) {
    const [message, setMessage] = useState<string | null>(null)

    const share = async () => {
        try {
            const blob = await (await fetch(src)).blob()
            const file = new File([blob], fileName, { type: 'image/png' })
            if (navigator.canShare?.({ files: [file] }) === true) {
                await navigator.share({ files: [file], title: fileName })
                return
            }

            setMessage('Sharing isn’t available in this browser. Use Download instead.')
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return
            }

            setMessage('Couldn’t share the image. Use Download instead.')
        }
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            <a href={src} download={fileName} className="min-h-10 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold">
                Download
            </a>
            <button
                type="button"
                onClick={() => {
                    void share()
                }}
                className="min-h-10 rounded-lg bg-maroon px-4 text-sm font-semibold text-on-maroon"
            >
                Share
            </button>
            {message === null ? null : <span className="text-xs text-muted">{message}</span>}
        </div>
    )
}
