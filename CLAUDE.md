# Last Man Standing

## Button feedback (a rule)

**Every button that is pressed MUST show that it was pressed.** No exceptions.

1. **A button that submits a form** uses `<SubmitButton>` from `@/components/SubmitButton`.
   - While the form is sending, it is disabled and shows a spinner and a short label.
   - Disabled means a second press does nothing. This stops duplicates.
   - Set `pendingLabel` to say what is happening: “Saving…”, “Deleting…”, “Opening payment…”.
     The default is “Working…”.
   - In the admin area use `<Submit>` from `@/components/admin/ui`. It wraps `SubmitButton`.
   - Do not write `<button type="submit">` or a bare `<button>`. ESLint fails the build.
2. **A button with an `onClick`** uses `type="button"`. It must show its own result at once.
   - A state change counts: a selected team, a pressed filter, a “Copied ✓” label.
   - If it waits on a network call or a slow task, add a busy state like the Share button does.
3. **When the action is done, say so.**
   - An admin action redirects with `?notice=` or `?error=`. `AdminNotice` shows it as a toast
     with a ✓. It fades after 5 seconds. An error stays until it is dismissed.
   - A player action that moves to another page is confirmed by that page.
   - A player action that stays on the page shows a toast, like “Saved ✓” on the pick screen.
4. **Never move the layout.** `SubmitButton` keeps the button’s width while it is pending.
   Keep that when you add new states.
5. **Respect reduced motion.** Use `motion-reduce:animate-none` on any new spinner.

Write the error text in plain words. Say what to do next.

## Checks

Run all three before you finish: `pnpm typecheck`, `pnpm lint`, `pnpm test`.
