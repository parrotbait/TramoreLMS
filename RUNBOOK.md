# Tramore Athletic Last Man Standing: Runbook

How to run the site day to day, fix common problems, start a new season and hand the site over. The rules of the game are in `PLAN.md` section 2 and on `/rules`.

Last checked: 2026-11-04.

---

## 1. What runs where

| Service | What it does | Account |
|---|---|---|
| Vercel (Hobby) | Hosts the site at `https://tramorelastmanstanding.vercel.app`. Deploys each push to `main`. Runs a daily backup cron. | Move to the club (section 9) |
| Neon Postgres | The database, `last-man-standing-db`, London region. Connected to the Vercel project for Production only. | Move to the club |
| cron-job.org | Calls `/api/cron/tick` every 10 minutes. This is the main clock. | Move to the club |
| Stripe | Card payments through Stripe Checkout. Sends webhooks to `/api/stripe/webhook`. | Club-owned if possible |
| football-data.org | Fixtures and results. This is the primary feed. | Move to the club |
| FPL API | The cross-check for results. It needs no account. | None |
| Gmail | Sends sign-in, welcome and reminder emails from `tramoreathleticsecretary@gmail.com`, using an app password. | The club |
| GitHub | The code, in the private repo `parrotbait/TramoreLMS`. | Move to the club |

### What the tick does

Each call to `/api/cron/tick` runs these steps in order:

1. Checks Stripe payments that are still pending (the safety net for missed webhooks).
2. Syncs fixtures and results from both feeds.
3. Opens the next week and fixes its cut-off.
4. At the cut-off, picks a team for anyone with no pick.
5. Settles weeks, and moves the competition on to running or finished.
6. Sends reminder emails. It sends at most 20 per call, and the rest go on the next call.
7. Removes the emails of players who didn't opt in, 90 days after their last competition ends.

Every step is safe to repeat. Page visits also lock weeks at the cut-off, so a late cron call never lets a pick in after the cut-off.

---

## 2. Settings (environment variables)

Set these in Vercel, under Project → Settings → Environment Variables, for Production. Locally, they live in `.env.local`. Git ignores that file. Never paste these values into chat, email or WhatsApp.

| Name | What it is |
|---|---|
| `POSTGRES_URL` | The Neon connection string. The Neon integration sets it. |
| `SITE_URL` | `https://tramorelastmanstanding.vercel.app`. Used in emails and WhatsApp text. |
| `ADMIN_EMAILS` | Admin addresses, separated by commas. Checked on every admin request. A change takes effect at once. |
| `CRON_SECRET` | At least 32 characters. cron-job.org and Vercel Cron send it as `Authorization: Bearer …`. Make one with `openssl rand -hex 32`. |
| `FOOTBALL_DATA_TOKEN` | The football-data.org API token. |
| `STRIPE_SECRET_KEY` | The Stripe secret key. Use live mode in production. |
| `STRIPE_WEBHOOK_SECRET` | The signing secret of the Stripe webhook endpoint. |
| `EMAIL_TRANSPORT` | `gmail` in production. `console` locally, which prints emails in the terminal. |
| `GMAIL_USER` | `tramoreathleticsecretary@gmail.com` |
| `GMAIL_APP_PASSWORD` | A Google app password. Get it from Google Account → Security → 2-Step Verification → App passwords. |
| `EMAIL_REPLY_TO` | The address replies go to. Usually the same as `GMAIL_USER`. |
| `ENABLE_PREVIEW` | Leave unset in production. `true` turns on `/preview`. |

After you change a variable in Vercel, redeploy. Use Deployments → … → Redeploy.

---

## 3. Each week

| When | What to do | Where |
|---|---|---|
| After the week opens | Check that the cut-off looks right. It is 1 hour before the first kick-off. | Admin → competition → Week N |
| The day before the cut-off | Post the reminder in the WhatsApp group. It gives counts only, with no names. The site also emails players who haven't picked, 24 hours before. | Admin → Share → Copy reminder |
| After the cut-off | Post the picks image. It shows how many players picked each team, with no names. | Admin → Share → Week N picks → Share |
| When the week settles | Post the standings image. | Admin → Share → Standings → Share |
| Any time | Clear open alerts. See section 4. | Admin → Alerts |

The dashboard shows how many players have picked and whether each week has settled.

---

## 4. Alerts

The tick and the payment code write alerts to Admin → Alerts. You don't get an email about them. Check the page at least once a day while games are on. Resolve each alert with a short note once you've dealt with it.

| Alert | What it means | What to do |
|---|---|---|
| Kick-off before the cut-off | A game moved to before the fixed cut-off. | Decide whether to move the cut-off earlier. Use Week N → Move cut-off. If you leave it, players can still pick a team whose game has already started. |
| Result held: scores disagree | football-data and FPL give different scores. The result is not used. | Check a trusted source, such as the Premier League site. Set the result with a fixture override. |
| Result held: no FPL result | FPL has no result 6 hours after kick-off. | Check the score. Set it with a fixture override. |
| Result changed | A feed corrected a score. The standings were worked out again. | Check that it is right. Tell the group if someone's status changed. |
| Missing from feed | football-data no longer lists the game. | Check whether it moved or was called off. Use a fixture override if needed. |
| Pass | A player has used every team that plays this week. They get a pass. | Usually no action. Use a pick override if you decide otherwise. |
| Week without fixtures | The next week has no games, so it can't open. | Check the fixture list on football-data.org. |
| Payment: renamed | A player paid after their name hold ran out, and someone else had taken the name. They got a new name. | Rename them on the Entries page if needed. |
| Payment: paid while withdrawn | A withdrawn entry paid. | Refund in Stripe, or reinstate the entry. |
| Payment: duplicate | The same entry paid twice. | Refund one payment in the Stripe dashboard. |
| Payment: late buy-back | A buy-back was paid after the Week 2 cut-off. It was applied anyway. | Decide whether to keep it. If not, refund it and use a pick override. |
| Payment: buy-back for inactive entry | A buy-back came in for an entry that isn't active. | Refund the buy-back in Stripe. |

### Overrides

Every override needs a reason. It goes in the audit log (Admin → Audit). The feed never undoes an override.

- **Fixture override** (Week N → fixture). This sets a score, or marks the game called off. It changes the outcome for everyone who picked either team.
- **Pick override** (Week N → player). This sets one player's outcome for one week. Their team stays used.
- **Move cut-off** (Week N). This moves the cut-off. Use it only for a game that moved earlier.

---

## 5. Common tasks

| Task | How |
|---|---|
| Add a cash or Revolut player | Entries → Add player. Enter the name, email, payment method and amount. They sign in at `/signin` with that email. They don't get a welcome email. |
| Record a cash buy-back | Entries → the player → Record buy-back. This works only for players out in Week 1, before the Week 2 cut-off. |
| Rename a player | Entries → the player → Rename. Names are unique and up to 20 characters. |
| Withdraw a player | Entries → the player → Withdraw, with a reason. They stop from the next week that hasn't locked. |
| Refund a player | Withdraw them and tick Refund. This works only before the Week 1 cut-off (rule 7). Stripe payments are refunded through Stripe. For cash and Revolut, the site only records the refund, so hand the money back yourself. |
| Delete someone's details on request | Entries → the player → Remove details. Type REMOVE and give a reason. This removes their email, and their entries become “Removed player”. |
| Export payments for the treasurer | Entries → Download CSV. |
| Show “€X raised” on the home page | Settings → tick “Show “€X raised for the club” on the home page”. The figure is paid money, less Stripe fees, less the prize. It shows only when it is above €0. |
| Open or close entries | Settings → Open entries or Close entries. The admin home page tags the competition that is “Taking entries”. Only one competition can take entries at a time. Entries close by themselves at the Week 1 cut-off. |
| Add another admin | Add their email to `ADMIN_EMAILS` in Vercel and redeploy. They sign in at `/admin/signin`. |

---

## 6. Deploys and database changes

- **Deploy.** Push to `main` on GitHub. Vercel builds and deploys by itself.
- **Before you push**, run these checks locally:

  ```
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm build
  ```

- **Database migrations.** New files in `src/db/migrations` must be applied to Neon before the code that needs them goes live. Get the Neon connection string from Vercel → Storage → the Neon database → `.env.local` tab. Use the unpooled URL if there is one. Then run:

  ```
  POSTGRES_URL='<the Neon URL>' pnpm db:migrate
  ```

  A value in the shell takes the place of `.env.local`. Clear your terminal history afterwards if it saved the URL.

- **Try a change locally first** against the local database. `pnpm tick --no-feed --now <time>` runs a tick at a pretend time. It only runs against a local database.

---

## 7. When something goes wrong

| Problem | Check |
|---|---|
| Weeks don't lock, or reminders don't go | cron-job.org → the job history. It must return HTTP 200. A 401 means `CRON_SECRET` doesn't match. The daily Vercel cron at 06:00 UTC is only a backup. Visiting `/pick` also locks the week at the cut-off. |
| No emails arrive | Check that `EMAIL_TRANSPORT=gmail` is set. Check the app password, which stops working if the Google password changes. Gmail allows about 500 emails a day. Players should check their spam folder. Vercel → Logs shows “Reminder email failed”. |
| A player paid but isn't in | Stripe → Developers → Webhooks → the endpoint → failed events. Resend them. The tick also checks pending payments every 10 minutes. |
| Results don't come in | Check that `FOOTBALL_DATA_TOKEN` is set and valid. The tick JSON shows `feed: { error: … }` when it fails. Use fixture overrides until the feed is back. |
| The site shows “Something went wrong” | Vercel → Logs for the error. Check that Neon is up and `POSTGRES_URL` is set. |
| A player says their sign-in link doesn't work | Links work once, for 30 minutes. Reminder links last until the cut-off. Ask them to get a new link at `/signin`. Some email apps open links early. The sign-in page needs a tap or JavaScript, so that doesn't use the link up. |

---

## 8. A new season

1. In July or August, sign in to `/admin`. Create a new competition with the start matchday, fees and prize. The site works out the season from the date and loads the fixtures from football-data.org.
2. Check the settings and the Week 1 fixtures.
3. Settings → Open entries. Only one competition can take entries at a time.
4. Share the `/enter` link in the WhatsApp group.

Past competitions stay in the admin area. Players who opted in can be told about the new season. The payments CSV has their emails, but it doesn't yet show who opted in.

---

## 9. Handover to the club

Every account should belong to `tramoreathleticsecretary@gmail.com` (Decision 10c). For each service in section 1:

1. Invite the club account as an owner, or transfer the project to it.
2. Check that the club account can sign in and see the project.
3. Remove the personal account.

Also:

- Set `ADMIN_EMAILS` to the new organisers' addresses.
- Make a new `CRON_SECRET`. Update it in Vercel and cron-job.org together.
- Make a new Gmail app password if the old one was ever shared.
- Give the new organiser this runbook and `PLAN.md`.

---

## 10. Launch checklist

Do this once, on the live site, before you share the link. Tick each line.

### Settings

- [ ] All variables in section 2 are set in Vercel for Production. `EMAIL_TRANSPORT` is `gmail`. `ENABLE_PREVIEW` is not set.
- [ ] Stripe is in live mode. The webhook endpoint is `https://tramorelastmanstanding.vercel.app/api/stripe/webhook`, with these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired` and `checkout.session.async_payment_failed`.
- [ ] All migrations are applied to Neon (section 6).
- [ ] cron-job.org calls `/api/cron/tick` every 10 minutes with the `Authorization: Bearer <CRON_SECRET>` header. The last run returned 200.

### The competition

- [ ] The competition exists, with the right start matchday, €10 entry, €5 buy-back and €300 prize.
- [ ] The Week 1 fixtures and cut-off look right.
- [ ] Entries are open (Settings → Open entries).
- [ ] `/`, `/rules` and `/privacy` show the right fee, prize and team list.

### A real entry, on a phone

- [ ] Open `/enter` on a phone. Enter with a real email, and pay €10 with a real card.
- [ ] After paying, you land signed in on the pick screen.
- [ ] The welcome email arrives from the club address, not in spam.
- [ ] Pick a team. The “Saved ✓” message shows. Change the pick once.
- [ ] Sign out. Sign in again at `/signin` with the emailed link.
- [ ] The entry and payment show in Admin → Entries, with the Stripe fee filled in.
- [ ] Refund it: Entries → Withdraw → tick Refund. The refund shows in Stripe. You can also keep the entry and play.

### Admin

- [ ] Sign in at `/admin/signin`. Only addresses in `ADMIN_EMAILS` get a link.
- [ ] Share page: Copy reminder works. The images load and share to WhatsApp from a phone.
- [ ] Add a cash entry, then remove it.
- [ ] Admin → Alerts is empty, or each alert is understood.

### Before you share the link

- [ ] The club has confirmed the permit or licence question (Gambling Regulation Act 2024).
- [ ] The club is happy with the Premier League crests on the site.
- [ ] Push the latest code. Check that the Vercel deploy is green.
