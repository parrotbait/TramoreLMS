// Created by Claude driven by Eddie Long on 2026-11-15.
//
// The one submit button for the whole app. Every button that submits a form
// uses this, so every press gives feedback (see CLAUDE.md, “Button feedback”).
//
// While the form is sending, the button is disabled, which stops a second
// press, and it shows a spinner and a short label. Both labels share one
// space, so the button keeps its width and nothing around it moves. With
// “reduce motion” on, the spinner stands still and the label does the work.
//
// It must sit inside the <form>. useFormStatus reads that form.

'use client'

import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

interface SubmitButtonProps {
    readonly children: ReactNode
    /** Shown while sending. Say what is happening, for example “Saving…”. */
    readonly pendingLabel?: string
    /** Size, colour and shape. The button adds nothing visual of its own. */
    readonly className?: string
    readonly disabled?: boolean
}

export function SubmitButton({ children, pendingLabel = 'Working…', className = '', disabled = false }: SubmitButtonProps) {
    const { pending } = useFormStatus()

    return (
        <button
            type="submit"
            disabled={disabled || pending}
            aria-busy={pending}
            className={`${className} ${pending ? 'cursor-progress' : ''}`}
        >
            <span className="grid place-items-center">
                <span className={`col-start-1 row-start-1 ${pending ? 'invisible' : ''}`}>{children}</span>
                <span
                    aria-hidden={!pending}
                    className={`col-start-1 row-start-1 inline-flex items-center gap-2 ${pending ? '' : 'invisible'}`}
                >
                    <Spinner />
                    {pendingLabel}
                </span>
            </span>
        </button>
    )
}

function Spinner() {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4 animate-spin motion-reduce:animate-none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
    )
}
