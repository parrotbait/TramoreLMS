# Tramore Athletic Last Man Standing: Plan

A website that runs a Premier League Last Man Standing competition as a fundraiser for Tramore Athletic. Players enter and pay without a password. They pick one team per Premier League matchday. Results come in automatically from a feed. The admin can override anything.

Status: plan agreed on 2026-10-31. Not yet implemented.

---

## 1. Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Payment | Stripe Checkout. The admin can also record cash and Revolut payments by hand. Use a club-owned Stripe account if possible. |
| 2 | Identity | Magic-link sign-in by email. No passwords. One email can hold several entries. |
| 3 | Feed | football-data.org is the primary feed (existing key). The FPL API is a cross-check. A game week is a Premier League matchday. |
| 4 | Start | Competition Week 1 is set in the admin area as a PL matchday. The setting locks at the Week 1 cut-off. Entries close at the Week 1 cut-off. |
| 4b | Buy-back team | A player who buys back keeps their Week 1 team as used. |
| 5 | Draws | A draw is out. |
| 6 | End conditions | One survivor wins immediately. If everyone still in goes out in the same week, they all stay in. Their teams from that week stay used. At matchday 38 the survivors share the prize. |
| 6b | Prize | €300. It is a per-competition setting. |
| 7 | Postponements | Postponed before the cut-off: the player must pick again. Postponed or cancelled after the cut-off: the player is through and the team is used. Abandoned: the league result counts if it is confirmed before the week settles. Otherwise it is treated as cancelled. |
| 7b | Admin authority | The admin can override every automatic decision. Each override needs a reason and is written to an audit log. The feed never undoes an override. |
| 8 | Auto-assign | At the cut-off, any active player with no valid pick gets the first team, in alphabetical order of club name, that they have not used and that has a fixture this week which is not postponed. Club names are the full official names with non-essential prefixes dropped. For example, “Bournemouth”, not “AFC Bournemouth”, so it sorts after Arsenal. If no team is left, they get a pass and the admin gets an alert. Auto-picks are labelled “Auto”. |
| 9 | Overrides | Two levels. A fixture override sets a fixture’s result and so affects everyone who picked it. A pick override sets one player’s outcome for one week. The team stays used after a pick override. There is no “bye” concept. |
| 10 | Admin access | Magic link plus an email allowlist in the `ADMIN_EMAILS` environment variable. Admin links last 15 minutes and work once. Admin sessions last 7 days. No 2FA. |
| 10b | Multi-season | Every season is a new competition. Past competitions are archived read-only. Each competition has its own team list. |
| 10c | Handover | All accounts belong to `tramoreathleticsecretary@gmail.com`, not a personal address. `RUNBOOK.md` documents operations. |
| 10d | Branding | “Tramore Athletic Fundraiser” appears everywhere. The club colours and logo are in one theme file (see section 3a). The “€X raised” figure is shown only if an admin setting turns it on. It is off by default. |
| 11 | Reminders | One automatic email, 24 hours before the cut-off, to active players who have not picked. The admin gets a “Copy reminder” button that produces a WhatsApp message with counts only and no names. |
| 12 | Cut-off | The cut-off is 1 hour before the earliest kick-off, calculated when the week opens. After that it is fixed and only an admin override moves it. The server enforces it. Times are shown in Europe/Dublin time. |
| 12b | Pick visibility | Before the cut-off, players see only their own pick. After the cut-off, everyone’s picks are visible read-only. Past weeks can always be browsed. |
| 13 | Hosting | Vercel Hobby. Owner accepts the risk under the Hobby terms of use. Neon Postgres. cron-job.org calls the scheduled job every 10 minutes. |
| 14 | Testing | Rules-engine unit tests are the priority. A command-line season simulator is also required. No browser tests, CI or staging. A manual launch checklist covers payment and sign-in. |
| 15 | Simulator | Three modes: random (with a seed), interactive and scenario files. Scenario files double as regression tests. Real fixtures by default. `--synthetic` works offline. |
| 16 | WhatsApp images | A weekly status image, with names, and a picks-revealed image, with counts per team and no names. Reminders never name individuals. |
| 17 | Privacy | Display names are unique per competition, case-insensitive, at most 20 characters, and the admin can edit them. Emails are visible to admins only. An unticked opt-in box covers future competitions. Emails of players who did not opt in are deleted 90 days after the competition ends. Players can be deleted on request. |
| 18 | Entry flow | A pending entry holds the display name for 1 hour, matching the Stripe Checkout session expiry. Only paid entries can pick. Buy-back reactivates the same entry. Full refunds only before the Week 1 cut-off. |
| 19 | Visibility | Public pages are home, entry, rules and privacy. Standings, everyone’s picks and the archive need sign-in with an entry in that competition. Private pages are `noindex`. |
| 20 | Settlement | A result is accepted automatically when football-data.org shows the match as finished and FPL agrees. Each player can pick for the next week as soon as their own result is “through”. “Out” is provisional until the whole week settles, because of rule 6. |
| 21 | Team crests | A club crest is shown beside every team name: pick buttons, history, everyone’s picks, standings and the WhatsApp images. The crests come from football-data.org and are stored in `public/crests/`, never hotlinked. If a crest file is missing, a neutral badge with the club’s initials is shown. Crests are trademarks, so check use with the club. |
| 22 | Browser preview | `/preview` runs the player screens against a simulated 40-player competition in memory, with a toolbar to move time on. Development only, unless `ENABLE_PREVIEW=true`. |

---

## 2. Public rules text

This is the source text for `content/rules.md`. Values in `{braces}` come from the competition settings.

1. **Pick one team each game week.** A game week is a Premier League matchday. If your team wins, you are through to the next round. If your team draws or loses, you are out.
2. **You can pick each team only once.** This includes auto-assigned teams and teams whose match was cancelled.
3. **Buy-back after Week 1 only.** If you go out in Week 1, you can buy back in for {buybackFee} until the Week 2 cut-off. Your Week 1 team stays used. There is no buy-back after any other week.
4. **The cut-off is 1 hour before the first match of the game week.** You can change your pick as often as you like until then. If you have no pick at the cut-off, you get the first team in alphabetical order (full club name) that you have not used and that has a match that week. The full order is listed below.
5. **Postponed and cancelled matches.**
   - Postponed before the cut-off: you must pick again. If you do not, rule 4 applies.
   - Postponed or cancelled after the cut-off: you are through, and the team counts as used.
   - Abandoned: the league’s confirmed result counts. If there is none when the rest of the week is finished, it is treated as cancelled.
6. **How it ends.**
   - If only one player is left, they win {prize}.
   - If everyone still in goes out in the same week, they all stay in and play on.
   - If more than one player is still in after matchday 38, they share {prize} equally.
7. **Refunds.** Full refund before the Week 1 cut-off. No refunds after that.
8. **The organiser’s decision is final** on anything these rules do not cover.

All money after the prize goes to Tramore Athletic.

---

## 3. Architecture

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) everywhere |
| Framework | Next.js, App Router, on Vercel Hobby |
| Database | Neon Postgres, using Drizzle ORM and versioned migrations |
| Payments | Stripe Checkout and webhooks |
| Email | Resend (free tier: 3,000 emails a month) |
| Images | `@vercel/og` (Satori) on the site. Satori and resvg in the simulator. |
| Scheduler | cron-job.org calls `POST /api/cron/tick` every 10 minutes with a secret header |
| Tests | Vitest |
| Package manager | pnpm. Installs go through `npm.apple.com` only, never the public registry. Vercel installs the same locked versions on its side. Same setup as LeWorldCup2026. |
| Styling | Tailwind CSS v4, with theme tokens from `src/theme/` |
| Validation | Zod, for form input and the environment variables (checked at start-up) |
| Scripts | `tsx` for the simulator and the database scripts |
| Local database | Homebrew `postgresql@16`. `POSTGRES_URL` points at it locally, and the Neon integration injects it on Vercel. |

### Directory layout

```
src/
  engine/            Pure rules engine. No I/O. No database. No clock access.
  feeds/             football-data.org and FPL adapters, plus reconciliation
  db/                Drizzle schema, migrations, repositories
  jobs/              The tick job and its steps
  auth/              Magic links and sessions
  payments/          Stripe Checkout and webhook handling
  email/             Templates and sending
  images/            WhatsApp image rendering (shared by the site and the simulator)
  app/               Next.js routes and pages
  theme/             Colour, font and logo tokens (one file)
content/
  rules.md
  privacy.md
sim/
  cli.ts             Simulator entry point
  scenarios/*.yaml   Scenario files (also run as tests)
  fixtures/          Cached 2026/27 fixture list and recorded feed responses
```

### Key principles

- **The engine is pure.** All functions take inputs and return outputs. The current time is a parameter. The website, the tick job and the simulator all call the same engine.
- **Standings are derived, not stored.** The standings come from competition settings, fixtures, picks, payments and overrides. Reopening a settled week means calculating again. At 200 players × 28 weeks this is cheap.
- **Every job can be run again safely.** Unique constraints and idempotency keys prevent double auto-assigns, double emails and double payment processing.
- **Requests do not rely on the scheduler.** Each request also checks the cut-off. If the job is late, the first request after the cut-off locks the week and runs auto-assign inside a transaction.
- **The server enforces the cut-off.** A pick is rejected if the database time is at or past `cutoff_at`.

### 3a. Theme

The colours are sampled from `public/brand/logo-shield.png`. All of them live in `src/theme/`. No other file contains colour values.

| Token | Value | Use |
|---|---|---|
| `maroon` | `#830000` | Primary. Header, primary buttons, selected pick |
| `gold` | `#EBAD0A` | Secondary. Accents, highlights, “in” badges |
| `onMaroon` | `#FFFFFF` | Text on maroon (10.7:1) |
| `onGold` | `#1A1A1A` | Text on gold (8.8:1). Maroon is also allowed (5.4:1). |
| `surface` | `#FFFFFF` | Page background |
| `text` | `#1A1A1A` | Body text |
| `muted` | `#6B6B6B` | Used teams, “out” rows |
| `subtle` | `#F7F4EE` | Card and panel backgrounds |
| `line` | `#E3DED4` | Borders and dividers |

Rules:

- White text never goes on gold, because the contrast is only 2.0:1.
- “In” is shown as a gold badge with dark text and a ✓.
- “Out” is shown as muted grey text with a strike-through and a ✗. Red is not used, because it is too close to the maroon.
- Logo files:
  - `public/brand/logo-shield.png` is the full crest.
  - The favicon and the home-screen icon are generated from the crest.

---

## 4. Data model

Money is stored in cents. Times are stored as `timestamptz` in UTC and shown in Europe/Dublin time.

```
person            id, email (unique, lowercase), future_comms_opt_in, created_at, deleted_at
competition       id, name, season, start_matchday, entry_fee_cents, buyback_fee_cents,
                  prize_cents, entries_open, show_raised, status, created_at
team              id, competition_id, full_name, short_name, football_data_id, fpl_id
week              id, competition_id, number, pl_matchday, cutoff_at, cutoff_overridden,
                  opened_at, settled_at
fixture           id, week_id, home_team_id, away_team_id, kickoff_at,
                  fd_status, fd_home, fd_away, fpl_finished, fpl_home, fpl_away,
                  postponed_before_cutoff, resolution, home_goals, away_goals,
                  overridden, override_reason
entry             id, competition_id, person_id, display_name, display_name_key (unique per
                  competition), status, hold_expires_at, withdrawn_at, created_at
payment           id, entry_id, kind, method, amount_cents, fee_cents, stripe_session_id,
                  stripe_payment_intent_id, status, refunded_at, note, created_at
pick              id, entry_id, week_id, team_id (nullable for a pass), source, updated_at
                  unique (entry_id, week_id)
                  unique (entry_id, team_id) where team_id is not null
pick_override     id, entry_id, week_id, outcome, reason, actor_email, created_at
magic_link        token_hash, person_id, purpose, expires_at, used_at
session           id_hash, person_id, is_admin, expires_at
email_sent        entry_id, week_id, kind    unique (entry_id, week_id, kind)
alert             id, competition_id, kind, message, resolved_at, created_at
audit_log         id, actor_email, action, target_type, target_id, before, after, reason, at
```

Statuses, one value per line:

- `competition.status`:
  - `draft`
  - `open`
  - `running`
  - `finished`
- `entry.status`:
  - `pending`
  - `active`
  - `withdrawn`

  Being through, out or a winner is derived. It is not stored.
- `payment.kind`:
  - `entry`
  - `buyback`
- `payment.method`:
  - `stripe`
  - `cash`
  - `revolut`
  - `other`
- `pick.source`:
  - `player`
  - `auto`
  - `auto_pass`
- `fixture.resolution`:
  - `pending`
  - `result`
  - `void`
  - `held` (the feeds disagree, so admin action is needed)

---

## 5. Rules engine

All functions are in `src/engine/`. None of them do I/O.

| Function | Purpose |
|---|---|
| `computeCutoff(fixtures)` | Returns 1 hour before the earliest kick-off. Called once, when a week opens. |
| `availableTeams(entry, week, picks, fixtures)` | Returns teams the player has not used that have a fixture this week that is not postponed. |
| `validatePick(entry, team, week, now, …)` | Checks the cut-off, that the entry is paid and active, that the player is through the previous week, and that the team is available. |
| `autoAssign(entries, week, …)` | Applies rule 4: the first available team by `full_name`, or a pass with an alert. |
| `resolveFixture(fixture, cutoff)` | Returns `win`, `draw` or `loss` for each side, or `void`. Applies the postponement cases from rule 5. |
| `pickOutcome(pick, fixture, overrides)` | Returns `through` or `out`. A pick override wins over a fixture override, which wins over the feed. |
| `settleWeek(week, …)` | Applies the everyone-out rule and returns the final week outcomes. |
| `standings(competition, …)` | Returns each entry’s status after each week, the winner or winners, and the end state. |
| `buybackEligible(entry, …)` | True only if the player was out in Week 1, the Week 2 cut-off has not passed, and they have not already bought back. |
| `canPickNextWeek(entry, …)` | True as soon as the player’s own result for the previous week is “through”. |
| `reconcile(fd, fpl)` | Returns `accept`, `wait` or `hold`, and the result. |

Each rule and each edge case from the decisions table has at least one unit test and one scenario file.

---

## 6. Feed and the tick job

`POST /api/cron/tick` runs these steps in order. Each step is idempotent.

1. **Sync fixtures.** Do this once a day outside match windows, and on every tick from 2 hours before the first kick-off until the week settles. Raise an alert if a fixture moves to before the current cut-off.
2. **Open weeks.** When a week is next and is not yet open, set `cutoff_at` by calling `computeCutoff`. The cut-off is fixed from then on.
3. **Lock weeks.** Once the cut-off has passed, mark fixtures that were postponed before the cut-off and run `autoAssign`.
4. **Accept results.** Call `reconcile`. A disagreement sets the fixture to `held` and raises an alert. The admin gets an alert email.
5. **Settle weeks.** A week settles when every player still in has a final outcome. A stuck fixture that nobody picked does not hold up the week.
6. **Send reminders.** Send the 24-hour email. Send the late email to players who become “through” after the 24-hour point.
7. **Expire holds.** Pending entries past `hold_expires_at` lose their name hold.
8. **Retention.** Remove emails 90 days after a competition finishes, unless the player opted in to future communications.

Feed adapters map teams by ID, never by name. The full official names are our own data.

---

## 7. Sign-in

- **Players:** they request a link by email. The link is a single-use token, stored as a hash, and expires after 30 minutes. Opening it sets an HTTP-only, Secure, SameSite=Lax session cookie that lasts until the season ends.
- **Reminder emails** contain a fresh sign-in link that goes straight to the pick screen. It works once and lasts until that week’s cut-off, not 30 minutes, because the email goes out up to 24 hours before.
- **Admins:** the same flow, limited to `ADMIN_EMAILS`. Admin links last 15 minutes and work once. Admin sessions last 7 days. Every `/admin` request checks the session again.
- **Several entries:** a signed-in person with more than one entry sees an entry switcher.
- **Rate limits:** at most 3 sign-in emails per address per hour and 20 per IP address per hour.

---

## 8. Payments

1. The player submits a display name, an email address and the opt-in choice.
2. The server checks that the name is unique and creates a `pending` entry with a 1-hour hold.
3. The server creates a Stripe Checkout Session that expires after 1 hour. It carries the entry ID in its metadata. The statement descriptor reads “TRAMORE ATHLETIC”.
4. The `checkout.session.completed` webhook marks the entry `active` and records the payment and the Stripe fee. The webhook is verified by signature and is idempotent on `stripe_session_id`.
5. If the hold has already expired and the name has been taken, the entry becomes active as “Name (2)” and the admin gets an alert.

**Buy-back** uses the same flow with `kind = buyback`. It is offered only when `buybackEligible` is true.

**Refunds** before the Week 1 cut-off are issued from the admin area through the Stripe Refunds API. Manual payments are refunded by hand and recorded.

---

## 9. Pages

| Route | Who can see it | Content |
|---|---|---|
| `/` | Public | What this is, “Tramore Athletic Fundraiser”, the next cut-off, the prize, Enter button, “€X raised” if the setting is on |
| `/enter` | Public | Entry form, then Stripe Checkout |
| `/rules`, `/privacy` | Public | Rendered from `content/*.md` |
| `/signin` | Public | “Send me my link” |
| `/pick` | Player | Header: “Week N · PL Matchday M · Cut-off Sat 21 Nov, 11:30”. Fixtures in kick-off order. Used teams greyed out with “Used in Week X”. Tap to pick, with a “Saved ✓” toast. Countdown in the final 24 hours. Buy-back banner when eligible. |
| `/picks/[week]` | Player | Read-only picks after the cut-off, grouped by team, with “Auto” labels and outcomes. Before the cut-off: “Picks are revealed at the cut-off”. |
| `/standings` | Player | Who is in and who is out |
| `/me` | Player | Pick history strip, entries, opt-in setting |
| `/archive` | Player (in that competition) | Past competitions and their winners |
| `/admin` | Admin | Dashboard: alerts, this week’s pick count, settlement state |
| `/admin/settings` | Admin | Start matchday, fees, prize, entries open, show raised, new competition |
| `/admin/entries` | Admin | Entries, emails, payments, manual entry, rename, withdraw and refund, delete, CSV export |
| `/admin/weeks/[n]` | Admin | Fixtures, results, fixture overrides, pick overrides, cut-off override, reopen week |
| `/admin/share` | Admin | Copy reminder (counts only), status image, picks-revealed image, download and share |
| `/admin/audit` | Admin | Audit log |

All private routes are `noindex` and `Cache-Control: private`.

---

## 10. WhatsApp outputs

**Copy reminder** (text, counts only):

```
⚽ Tramore Athletic Last Man Standing, Week 4 (PL Matchday 14)
Cut-off: Sat 21 Nov, 11:30
18 still in · 6 haven’t picked yet
Pick here 👉 {siteUrl}
No pick = auto-assigned. Rules: {siteUrl}/rules
```

After Week 1, the message adds this line: “Out in Week 1? Buy back in for €5 until {week2Cutoff}.”

**Status image** (PNG, 1080 pixels wide):

- Header: logo, title, “Tramore Athletic Fundraiser”, the week and matchday
- “18 of 42 still standing”
- Still in: names with ✓, in two or three columns
- Out this week: names with ✗ and the result
- Out earlier: count only
- Footer: prize, next cut-off, site link
- Above 150 players, the image shows counts only

**Picks-revealed image:** the number of players per team, with no names.

The in/out status must not depend on colour alone. Use ✓ and ✗ as well.

---

## 11. Simulator

Built in step 3. Lives in `sim/`. It uses the real rules engine.

```
pnpm sim --players 30 --start 11 --seed 42      # random results, reproducible
pnpm sim --players 30 --start 11 --interactive  # you type each result
pnpm sim --scenario sim/scenarios/x.yaml        # run one scenario file
pnpm sim --fetch                                # download the real 2026/27 fixtures
pnpm sim ... --synthetic                        # made-up 20-team season, works offline
pnpm sim ... --verbose                          # every player and result
pnpm sim ... --png out/                         # WhatsApp images (build step 11, not yet)
```

- **Each week follows a realistic timeline:**
  - The week opens and the cut-off is fixed.
  - Players pick.
  - Early postponements land.
  - Players re-pick.
  - Auto-assign runs at the cut-off.
  - Late postponements land.
  - Results come in through `reconcile`.
  - Overrides are applied.
  - Auto-assign runs again, for players who became eligible late.
- **Random mode:** results follow team strength (`sim/strength.ts`). That gives about 45% home wins, 25% draws and 30% away wins between even sides. Players strongly prefer favourites. About 5% forget to pick each week. A seed gives the same season every time.
- **Interactive mode:** enter `2-1`, `d`, `p` (postponed) or `a` (abandoned), or press Enter for a random result. After the results, apply `fixture <team> <2-1|void>` or `pick <player> through|out`. Answers can be piped in from a file.
- **Scenario YAML:** a season written as fixture lines (`Arsenal v Chelsea 1-0`, `P`, `PL`, `A`, `2-1|2-2`, `=> void`), picks, re-picks, buy-backs, withdrawals and overrides. Each week lists the outcome you expect. Corrections after the last week cover reopening a week. `pnpm test` runs every file in `sim/scenarios/`.
- **Soak test (`sim/soak.test.ts`):** 30 random seasons with different seeds, player counts and start weeks. After each season it checks:
  - there's always a winner
  - an early finish has exactly one survivor
  - nobody used a team twice
  - every auto-pick was the first available team alphabetically
  - a reinstated week means everyone still in went out together

Initial scenarios:

- draw-is-out
- one-team-once
- buyback-week1-only
- buyback-team-stays-used
- autoassign-alphabetical
- autoassign-skips-postponed
- autoassign-pass-when-none-left
- postponed-before-cutoff-repick
- postponed-after-cutoff-through
- abandoned-result-stands
- abandoned-no-result-void
- everyone-out-stays-in
- single-survivor-wins
- matchday38-split
- fixture-override
- pick-override-holiday
- reopen-settled-week
- feeds-disagree-held
- cutoff-fixed-after-postponement

---

## 12. Code style

The owner’s standards are written for Swift. They are applied to TypeScript as follows:

- Always use braces, with the body on its own line. This includes early `return`, `break` and `continue` (ESLint `curly: all`).
- The success path is the last, unindented `return`. Failure cases exit early.
- Export as little as possible. Module-private is the default.
- Union types and `switch` cases list one member per line.
- User-facing text uses smart quotes (’ “ ”), never straight quotes.
- Dependencies such as the database, clock, Stripe, email and feeds are reached through one small `deps` module. Tests and the simulator can then swap them out. They are not passed through every function.
- Strict TypeScript, ESLint and Prettier. No `any`.
- File header attribution: “Created by Claude driven by Eddie Long”.

---

## 13. Build order

1. Set up the project: Next.js, TypeScript, ESLint, Prettier, Vitest, Drizzle and the local `.env`.
2. **The rules engine and its unit tests.**
3. **The simulator:** synthetic mode, then scenario files, then cached real fixtures, then interactive mode.
4. Feed adapters (football-data.org and FPL), reconciliation and recorded responses.
5. Database schema, migrations and repositories.
6. The tick job and the checks done on each request.
7. Magic-link sign-in.
8. Entry, Stripe Checkout, webhook, buy-back and refunds.
9. Player pages: pick, picks, standings, me and archive.
10. Admin pages.
11. Image rendering, shared with the simulator.
12. Reminder emails.
13. Rules and privacy pages, theme file and logo placeholder.
14. `RUNBOOK.md` and the manual launch checklist. Push to GitHub.

---

## 14. Open items

- Permit or licence check under the Gambling Regulation Act 2024. The owner will report back.
- Confirm with the club that showing Premier League club crests is acceptable.
- Email sending: the club Gmail through SMTP for now, or a bought domain with Resend. Players cannot be emailed from a `vercel.app` address through Resend.
- Move the accounts to `tramoreathleticsecretary@gmail.com`: Vercel, GitHub, Stripe, Resend, football-data.org, Neon, cron-job.org and the domain.
- Final design of the WhatsApp images.

Done:

- Site address: `https://tramorelastmanstanding.vercel.app` (Vercel Hobby, production domain). Use it for `SITE_URL`, the cron-job.org job (`/api/cron/tick`) and the Stripe webhook.
- Repository: `github.com/parrotbait/TramoreLMS`, private.

- Club colours and logo. See section 3a.
