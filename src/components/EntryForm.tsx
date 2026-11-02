// Created by Claude driven by Eddie Long on 2026-11-02.
//
// The entry form. Errors show beside the field, and what was typed is kept.

'use client'

import { useActionState } from 'react'
import type { ReactNode } from 'react'

import { entryFieldMessage } from '@/payments/entry-rules'
import type { EntryFormState } from '@/payments/actions'

interface EntryFormProps {
    readonly action: (previous: EntryFormState, formData: FormData) => Promise<EntryFormState>
    readonly feeLabel: string
}

const INITIAL: EntryFormState = {
    values: { displayName: '', email: '', futureCommsOptIn: false },
    errors: {},
    problem: null,
}

export function EntryForm({ action, feeLabel }: EntryFormProps) {
    const [state, formAction, isPending] = useActionState(action, INITIAL)
    const nameError = state.errors.displayName === undefined ? null : entryFieldMessage(state.errors.displayName)
    const emailError = state.errors.email === undefined ? null : entryFieldMessage(state.errors.email)

    return (
        <form action={formAction} className="space-y-4" noValidate>
            {state.problem === null ? null : <Problem problem={state.problem} />}

            <Field id="displayName" label="Name on the standings" hint="For example “Seán M”. Up to 20 characters." error={nameError}>
                <input
                    id="displayName"
                    name="displayName"
                    defaultValue={state.values.displayName}
                    maxLength={30}
                    autoComplete="nickname"
                    aria-invalid={nameError !== null}
                    className="min-h-12 w-full rounded-xl border border-line px-3 text-base"
                />
            </Field>

            <Field id="email" label="Email address" hint="We email your sign-in link here. Only the organiser sees it." error={emailError}>
                <input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue={state.values.email}
                    autoComplete="email"
                    inputMode="email"
                    aria-invalid={emailError !== null}
                    className="min-h-12 w-full rounded-xl border border-line px-3 text-base"
                />
            </Field>

            <label className="flex items-start gap-3 text-sm">
                <input
                    type="checkbox"
                    name="futureCommsOptIn"
                    defaultChecked={state.values.futureCommsOptIn}
                    className="mt-1 h-5 w-5"
                />
                <span>Email me about future Tramore Athletic competitions.</span>
            </label>

            <button
                type="submit"
                disabled={isPending}
                className="min-h-12 w-full rounded-xl bg-maroon font-bold text-on-maroon disabled:opacity-60"
            >
                {isPending ? 'Opening payment…' : `Continue to pay ${feeLabel}`}
            </button>
        </form>
    )
}

function Field({ id, label, hint, error, children }: {
    readonly id: string
    readonly label: string
    readonly hint: string
    readonly error: string | null
    readonly children: ReactNode
}) {
    return (
        <div className="space-y-1">
            <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
            {children}
            {error === null
                ? <p className="text-xs text-muted">{hint}</p>
                : <p role="alert" className="text-xs font-semibold text-maroon">{error}</p>}
        </div>
    )
}

function Problem({ problem }: { readonly problem: NonNullable<EntryFormState['problem']> }) {
    const message = problem === 'nameTaken'
        ? 'Someone has already entered with that name. Try adding an initial or a nickname.'
        : problem === 'closed'
            ? 'Entries have closed.'
            : 'We couldn’t open the payment page. Please try again in a minute.'

    return <p role="alert" className="rounded-xl border-2 border-maroon bg-subtle px-3 py-2 text-sm font-semibold">{message}</p>
}
