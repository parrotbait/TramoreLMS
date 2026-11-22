// Created by Claude driven by Eddie Long on 2026-11-02.
//
// The entry form. Errors show beside the field, and what was typed is kept.

'use client'

import { useActionState } from 'react'
import type { ReactNode } from 'react'

import { SubmitButton } from '@/components/SubmitButton'
import { entryFieldMessage } from '@/payments/entry-rules'
import type { EntryFormState } from '@/payments/actions'

type Problem = NonNullable<EntryFormState['problem']>

interface EntryFormProps {
    readonly action: (previous: EntryFormState, formData: FormData) => Promise<EntryFormState>
    /** The button, for example “Continue to pay €10.00”. */
    readonly submitLabel: string
    /** The button while it sends, for example “Opening payment…”. */
    readonly pendingLabel: string
    /** Wording for a problem, where the usual text does not fit. The demo uses this. */
    readonly problemText?: Partial<Record<Problem, string>>
}

const INITIAL: EntryFormState = {
    values: { displayName: '', email: '' },
    errors: {},
    problem: null,
}

export function EntryForm({ action, submitLabel, pendingLabel, problemText = {} }: EntryFormProps) {
    const [state, formAction] = useActionState(action, INITIAL)
    const nameError = state.errors.displayName === undefined ? null : entryFieldMessage(state.errors.displayName)
    const emailError = state.errors.email === undefined ? null : entryFieldMessage(state.errors.email)

    return (
        <form action={formAction} className="space-y-4" noValidate>
            {state.problem === null
                ? null
                : <ProblemNotice problem={state.problem} override={problemText[state.problem]} />}

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

            <SubmitButton
                pendingLabel={pendingLabel}
                className="min-h-12 w-full rounded-xl bg-maroon font-bold text-on-maroon disabled:opacity-60"
            >
                {submitLabel}
            </SubmitButton>
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

function ProblemNotice({ problem, override }: { readonly problem: Problem; readonly override: string | undefined }) {
    const message = override ?? (problem === 'nameTaken'
        ? 'Someone already has that name. Try adding a letter or a nickname.'
        : problem === 'closed'
            ? 'Entries have closed.'
            : problem === 'busy'
                ? 'Lots of people are entering right now. Please try again in a few minutes.'
                : 'We couldn’t open the payment page. Please try again in a minute.')

    return <p role="alert" className="rounded-xl border-2 border-maroon bg-subtle px-3 py-2 text-sm font-semibold">{message}</p>
}
