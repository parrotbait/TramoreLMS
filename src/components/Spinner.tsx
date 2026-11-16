// Created by Claude driven by Eddie Long on 2026-11-16.
//
// The one spinner. It stands still when the device has “reduce motion” on,
// so whatever shows next to it has to say what is happening in words too.

export function Spinner({ className = 'h-4 w-4' }: { readonly className?: string }) {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            className={`${className} animate-spin motion-reduce:animate-none`}
        >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
    )
}
