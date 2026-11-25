# Tramore Athletic Last Man Standing: Runbook

How to run the site day to day, fix common problems, start a new season and hand the site over. The rules of the game are in `PLAN.md` section 2 and on `/rules`.

Last checked: 2026-11-17.

---

## 1. What runs where

| Service | What it does | Account |
|---|---|---|
| Vercel (Hobby) | Hosts the site at `https://tramorelastmanstanding.vercel.app`. Deploys each push to `main`. Runs a daily cron that only calls the tick if cron-job.org has missed it. It does not back up data. | Move to the club (section 9) |
| Neon Postgres | The database, `last-man-standing-db`, London region. Connected to the Vercel project for Production only. | Move to the club |
| cron-job.org | Calls `/api/cron/tick` every 10 minutes. This is the main clock. Also calls `/api/cron/backup` every 6 hours. | Move to the club |
| Vercel Blob | A private store that holds the encrypted database backups for 30 days (section 6, “Backups”). | Moves with the Vercel project |
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
7. Removes each player's email 90 days after their last competition ends. Admins are kept.
8. Emails the admins about any new alerts, in one email.

Every step is safe to repeat. Page visits also lock weeks at the cut-off, so a late cron call never lets a pick in after the cut-off.

---

## 2. Settings (environment variables)

Set these in Vercel, under Project → Settings → Environment Variables, for Production. Locally, they live in `.env.local`. Git ignores that file. Never paste these values into chat, email or WhatsApp.

| Name | What it is |
|---|---|
| `POSTGRES_URL` | The Neon connection string. The Neon integration sets it. |
| `SITE_URL` | `https://tramorelastmanstanding.vercel.app`. Used in emails and WhatsApp text. |
| `SITE_ALIASES` | Other addresses for the same site, comma-separated, for example `tramorelastmanstanding.ie`. A player who starts on one of these stays on it through payment and sign-in. Without it, they are sent back to `SITE_URL`, and the sign-in after payment fails because the cookie belongs to the other address. |
| `ADMIN_EMAILS` | Admin addresses, separated by commas. Checked on every admin request. A change takes effect at once. These addresses also get an email for each alert, and a “New player” email each time a player joins and has paid (online, or added by hand). |
| `CRON_SECRET` | At least 32 characters. cron-job.org and Vercel Cron send it as `Authorization: Bearer …`. Make one with `openssl rand -hex 32`. |
| `FOOTBALL_DATA_TOKEN` | The football-data.org API token. |
| `STRIPE_SECRET_KEY` | The Stripe secret key. Use live mode in production. |
| `STRIPE_WEBHOOK_SECRET` | The signing secret of the Stripe webhook endpoint. |
| `EMAIL_TRANSPORT` | `gmail` in production. `console` locally, which prints emails in the terminal. |
| `GMAIL_USER` | `tramoreathleticsecretary@gmail.com` |
| `GMAIL_APP_PASSWORD` | A Google app password. Get it from Google Account → Security → 2-Step Verification → App passwords. |
| `EMAIL_REPLY_TO` | The address replies go to. Usually the same as `GMAIL_USER`. |
| `BACKUP_PUBLIC_KEY` | The public key that encrypts the backups. The private key is kept offline and is never put here. |
| `BLOB_READ_WRITE_TOKEN` | Added by Vercel when you connect the Blob store. It lets the site save backups. |
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

The tick and the payment code write alerts to Admin → Alerts. The next tick emails every address in `ADMIN_EMAILS` about new alerts, so you hear within about 10 minutes. Each alert is emailed once. Resolve each alert with a short note once you've dealt with it.

| Alert | What it means | What to do |
|---|---|---|
| Kick-off before the cut-off | A game moved to before the fixed cut-off. | Decide whether to move the cut-off earlier. Use Week N → Move cut-off. If you leave it, players can still pick a team whose game has already started. |
| Result held: scores disagree | football-data and FPL give different scores. The result is not used. | Check a trusted source, such as the Premier League site. Set the result with a fixture override. |
| Result held: no FPL result | FPL has no result 6 hours after kick-off. | Check the score. Set it with a fixture override. |
| Result changed | A feed corrected a score. The standings were worked out again. | Check that it is right. Tell the group if someone's status changed. |
| Missing from feed | football-data no longer lists the game. | Check whether it moved or was called off. Use a fixture override if needed. |
| Pass | A player had no team to pick, because no game was played. They get a pass. This should now almost never happen: when a player has used every team that plays, their used teams start again. | Usually no action. Use a pick override if you decide otherwise. |
| Week without fixtures | The next week has no games, so it can't open. | Check the fixture list on football-data.org. |
| Week not opened: cut-off in the past | The week's first game still to come is under an hour away, or the tick ran very late. Opening it would lock it at once and pick for everyone. | Set the cut-off by hand on the Week page. The week then opens. |
| Results overdue | Some games have no result 4 hours after kick-off, whatever the reason: a feed problem, a mismatch, or a team-name mapping. | Check the feeds. Set the results by hand on the Week page with a fixture override. |
| Week blocked | Nobody can pick for the next week until this one settles, a result is held, and the next cut-off is within 24 hours. | Settle the held results on the Week page, or move the next cut-off. If you do nothing, everyone is auto-picked after the cut-off. |
| Called off after the cut-off | A game was called off and we first saw it after the cut-off. Everyone who picked it is through. | Check the game was really called off before the cut-off. If it was, this may not be fair to others. |
| Called-off game looks back on | A game marked as called off is back in the feed at about its first time. A call-off is never undone by itself. | Check whether it is being played. Use a fixture override to set the result. |
| Admin changed their own entry | An admin who also plays set their own result, withdrew, or recorded a buy-back for their own entry. It is allowed, and everyone is told. | Check it is right. |
| Payment: renamed | A player paid after their name hold ran out, and someone else had taken the name. They got a new name. | Rename them on the Entries page if needed. |
| Payment: paid while withdrawn | A withdrawn entry paid. | Refund in Stripe, or reinstate the entry. |
| Payment: duplicate | The same entry paid twice. | Refund one payment in the Stripe dashboard. |
| Payment: late buy-back | A buy-back was paid after the Week 2 cut-off. It was applied anyway. | Decide whether to keep it. If not, refund it and use a pick override. |
| Payment: buy-back for inactive entry | A buy-back came in for an entry that isn't active. | Refund the buy-back in Stripe. |

### Overrides

Every override needs a reason. It goes in the audit log (Admin → Audit). The feed never undoes an override.

- **Fixture override** (Week N → fixture). This sets a score, or marks the game called off. It changes the outcome for everyone who picked either team.
- **Pick override** (Week N → player). This sets one player's outcome for one week. Their team stays used.
- **Move cut-off** (Week N). This moves the cut-off. Use it only for a game that moved earlier. **A cut-off that has passed can't be moved later.** By then everyone's picks can be seen, and re-opening the week would let people change a pick. To help one player, use a pick override.

---

## 5. Common tasks

| Task | How |
|---|---|
| Add a cash or Revolut player | Entries → Add player. Enter the name, email, payment method and amount. They sign in at `/signin` with that email. They don't get a welcome email. |
| Record a cash buy-back | Entries → the player → Record buy-back. This works only for players out in Week 1, before the Week 2 cut-off. |
| Rename a player | Entries → the player → Rename. Names are unique and up to 20 characters. |
| Withdraw a player | Entries → the player → Withdraw, with a reason. They stop from the next week that hasn't locked. |
| Find a player | Admin → the competition → Entries → Find a player. It searches names and emails. |
| Fix a mistyped email | Entries → the player → Correct their email. It changes for all their entries, and we send a sign-in link to the new address. The audit log says it changed, not what it was. If another player already has that address, it is refused. |
| Refund a player | Withdraw them and tick Refund. This tool works only before the Week 1 cut-off. The public rules make no promise about refunds, so you decide each one. Stripe payments are refunded through Stripe. For cash and Revolut, the site only records the refund, so hand the money back yourself. |
| Delete someone's details on request | Entries → the player → Remove details. Type REMOVE and give a reason. This removes their email, and their entries become “Removed player”. |
| Export payments for the treasurer | Entries → Download CSV. |
| Show “€X raised” on the home page | Settings → tick “Show “€X raised for the club” on the home page”. The figure is paid money, less Stripe fees, less the prize. It shows only when it is above €0. |
| Open or close entries | Settings → Open entries or Close entries. The admin home page tags the competition that is “Taking entries”. Only one competition can take entries at a time. Entries close by themselves at the Week 1 cut-off. |
| Add another admin | Add their email to `ADMIN_EMAILS` in Vercel and redeploy. They sign in at `/admin/signin`. |

### Show someone how it works (the demo)

Admin → Demo runs a pretend competition on the live site. It has 20 bot players and you, with the real fixtures and rules.

1. Enter your name and press **Start a demo**. You get a demo entry on your own sign-in.
2. Open **Your pick screen** and pick a team. A banner says it is a demo.
3. Press **Next step** to move the demo clock on. Each week has three steps:
   - go to 3 hours before the cut-off (the countdown shows)
   - close picks (auto-picks run, and everyone's picks show)
   - play the games (random results by team strength, and the bots pick for the next week)
4. To steer the story, change a result on the demo's Week page with a fixture override before you play the games.
5. To let people play along on their own phone, share the **Invite link** on the Demo page. It works like the real sign-up:
   - They open the link and see the same form as `/enter`: a name and an email.
   - They go to the Stripe page and pay with the **test card** `4242 4242 4242 4242`, any date in the future, any 3 numbers. The link page shows them these.
   - They land on “You’re in the demo!”, already signed in on that browser, like a real player. They also get a welcome email with a sign-in link for their other devices. They never have to leave for their email.
   - **Nobody checks the email address.** If someone mistypes it, they still play on that browser, but they get no emails and can't sign in elsewhere. Fix it by adding them again with **Add a guest**. One safety rule: if the address already belongs to a real player (someone with an entry in a real competition), they are **not** signed in automatically. That person uses the emailed link, so nobody ends up in a real player's account.
   - Up to 30 people can join. The count shows on the Demo page.
   - The link **only works while Stripe is in test mode** (`STRIPE_SECRET_KEY` starts with `sk_test_`). When Stripe is live the link is switched off, so a demo can never charge a real card. Use **Add a guest** instead.
   - **Wiping the demo makes the old link stop working.** A new demo has a new link.

   To add one person yourself, use **Add a guest**. They get an email with a link to play, which works for 24 hours. After that they sign in at `/signin` with that email.
6. The emails are real, so you can test them. Add yourself as a guest with another address to see the invite. The “3 hours before the cut-off” step sends the real reminder email to every human in the demo who hasn't picked. Bots are never emailed.
7. Press **Wipe the demo** when you're done. It deletes the demo, its bots, every demo entry and any guest with nothing else on the site. Then you can start again.

A demo never takes real money, and it never sends alert emails or the “New player” email to the admins. Test payments from the invite link show in the Stripe test dashboard. The cron and the feeds leave it alone. Real players never see it, and it never shows on `/`, `/rules` or `/enter`. The only emails are the guest invite, sign-in links and the reminder from the Next step button. If you also have a real entry, use “Playing as” to switch between them.

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

### Backups

The site backs itself up **every 6 hours**. cron-job.org calls `/api/cron/backup`, the same way it calls the tick. Each run:

1. Reads every table in one go, so the backup is from a single moment. Sign-in tokens are left out.
2. Encrypts it with your **public key**. The server holds only the public key, so even someone who took over the server could not read the backups. Only the private key opens them.
3. Saves it in a **private Vercel Blob store**, as `backups/lms-<date>.json`. Vercel deletes each file by itself after **30 days**.

The admin home page shows **“✓ Last backup N hours ago”**. If a backup is more than 12 hours old, or the store is not connected, it turns into a red box instead. Look at that page when you sign in.

Neon also keeps its own short history for undoing a mistake. Check how far back your plan goes in the Neon console under Backup & Restore. That history is inside the same Neon account as the database, so the Blob backups are the copy that does not depend on Neon.

**One-time setup**

1. **Make the key pair.** On your own computer, in the project folder, run:

   ```
   scripts/make-backup-key.sh
   ```

   It makes the pair in `~/lms-backup-keys`, which is outside the project. It refuses to write inside any git repository, tests that the pair works, and copies the **public** key to your clipboard. It never prints the private key.

2. **Keep the private key safe, and out of GitHub and Vercel.** Put `lms-backup-private-<date>.pem` in a password manager, and give a copy to a second person at the club. Without it a backup cannot be opened. With it, anyone who has a backup can read it. `.gitignore` also blocks `*.pem` and `*.key`.
3. **Make the Blob store.** In Vercel, go to the project → Storage → Create → Blob. Choose **Private**. Connect it to the project for Production. Vercel adds `BLOB_READ_WRITE_TOKEN` for you.
4. **Add the public key.** In Vercel → Settings → Environment Variables, add `BACKUP_PUBLIC_KEY` for Production. Paste the public key from your clipboard (or the whole contents of `lms-backup-public-<date>.pem`), including the BEGIN and END lines. Then redeploy.
5. **Add the job on cron-job.org.**
   - Address: `https://tramorelastmanstanding.vercel.app/api/cron/backup`
   - Method: GET
   - Header: `Authorization: Bearer <CRON_SECRET>`, the same as the tick job.
   - Schedule: every 6 hours.
   - Turn on failure notifications.
6. **Run it once by hand.** Use “Test run” on cron-job.org. The response should say `"ok": true`. Then refresh the admin home page. It should say “Last backup less than an hour ago”.

**Rotate the key** (if the private key may have been seen by anyone it should not, or when a person who held it leaves):

1. Run `scripts/make-backup-key.sh`. It makes a new pair and copies the new public key.
2. In Vercel, replace `BACKUP_PUBLIC_KEY` with the new public key, and redeploy.
3. On cron-job.org, press “Test run”. The admin home page should show a fresh backup.
4. Download that new backup from the Blob store and check it opens with the **new** private key (the restore steps below, into a scratch database).
5. Only then, delete the **old** backups from the Blob store (Storage → the store → select → delete), or wait 30 days for them to expire. They can only be opened with the old key.
6. Keep the old private key until step 5 is done. It is needed for any old backup you still want. Then delete it.
7. If the old private key was ever in git, stop tracking it: `git rm --cached <file>`, commit and push. Rewriting history is not needed once the old backups are gone, because the old key then opens nothing.

**Check it is working.** The admin home page shows the age of the last backup. cron-job.org emails you if a run fails. A response with `"ok": false` says what is wrong, for example a missing key.

**Restore** (to recover from a disaster, or to move to a new database):

1. In Vercel, open Storage → the Blob store. Download the newest file under `backups/`.
2. Make a new, empty Neon database. Get its **direct (unpooled)** URL.
3. Make its tables:

   ```
   POSTGRES_URL='<the new database URL>' pnpm db:migrate
   ```

4. Restore into it:

   ```
   POSTGRES_URL='<the new database URL>' node --import tsx scripts/restore-backup.ts lms-<date>.json lms-backup-private.pem
   ```

   The script refuses a database that already has data. It also refuses a backup made with a different number of migrations, and tells you to run `pnpm db:migrate` first. A restore happens all at once: if it fails, nothing is written.
5. Point `POSTGRES_URL` in Vercel at the new database and redeploy. Players sign in again with a link, because sign-in tokens are not in the backup.
6. Check `/admin`: the competitions, entries and payments are there. Then check Stripe against the payments list.

Anything that happened after the last backup is lost, up to 6 hours. Stripe keeps its own record of every payment. After a restore, compare Stripe's payments list (Payments, since the backup time) with the Entries page. Add anyone who paid but is missing with **Add player**, and tell them. The tick's safety net can't find these, because it only checks payments it already has a pending row for.

**Practise a restore once** before the season starts, into a free scratch Neon database. A restore you have never tried is a guess. Also check that the Vercel dashboard really lets you download a file from the private store.

**A full copy by hand.** `scripts/backup-database.sh <source-url> backup.dump <scratch-server-admin-url>` makes a complete `pg_dump` file and checks that it restores. Use it before a risky change, for example a migration. It needs `pg_dump` installed.

**Privacy.** Backups hold emails. The privacy page promises that emails are deleted 90 days after a competition ends. Backups are deleted after 30 days, so an email can survive up to 30 days longer in an old backup. If you keep this, say so on the privacy page.

---

## 7. When something goes wrong

| Problem | Check |
|---|---|
| Weeks don't lock, or reminders don't go | cron-job.org → the job history. It must return HTTP 200. A 401 means `CRON_SECRET` doesn't match. The daily Vercel cron at 06:00 UTC is only a backup. Visiting `/pick` also locks the week at the cut-off. |
| No emails arrive | Check that `EMAIL_TRANSPORT=gmail` is set. Check the app password, which stops working if the Google password changes. Gmail allows about 500 emails a day. Players should check their spam folder. Vercel → Logs shows “Reminder email failed”. |
| A player paid but isn't in | Stripe → Developers → Webhooks → the endpoint → failed events. Resend them. The tick also checks pending payments every 10 minutes. |
| Results don't come in | Check that `FOOTBALL_DATA_TOKEN` is set and valid. The tick JSON shows `feed: { error: … }` when it fails. Use fixture overrides until the feed is back. |
| The admin home page says backups need attention | “Not set up”: connect the Blob store (section 6, “Backups”, step 3). “No backup yet” or “late”: open the backup job on cron-job.org and read its last response. `"ok": false` says why. A 401 means `CRON_SECRET` doesn't match. A message about the key means `BACKUP_PUBLIC_KEY` is missing or isn't a valid public key. |
| The site shows “Something went wrong” | Vercel → Logs for the error. Check that Neon is up and `POSTGRES_URL` is set. |
| A player says their sign-in link doesn't work | Links work once, for 30 minutes. Reminder links last until the cut-off. Ask them to get a new link at `/signin`. Some email apps open links early. The sign-in page needs a tap or JavaScript, so that doesn't use the link up. |

---

## 8. A new season

1. In July or August, sign in to `/admin`. Create a new competition with the start matchday, fees and prize. The site works out the season from the date and loads the fixtures from football-data.org.
2. Check the settings and the Week 1 fixtures.
3. Settings → Open entries. Only one competition can take entries at a time.
4. Share the `/enter` link in the WhatsApp group.

Past competitions stay in the admin area. Players aren't asked whether they want to hear about future seasons, so announce the new season in the WhatsApp group.

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
- Hand over the backup: give the new owner the **private key** (`lms-backup-private.pem`) and check they can find it. The Blob store moves with the Vercel project. Run the backup job once and check the admin home page shows a fresh backup.
- Give the new organiser this runbook and `PLAN.md`.

---

## 10. Launch checklist

Do this once, on the live site, before you share the link. Tick each line.

### Settings

- [ ] All variables in section 2 are set in Vercel for Production. `EMAIL_TRANSPORT` is `gmail`. `ENABLE_PREVIEW` is not set.
- [ ] Stripe is in live mode. The webhook endpoint is `https://tramorelastmanstanding.vercel.app/api/stripe/webhook`, with these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired` and `checkout.session.async_payment_failed`.
- [ ] All migrations are applied to Neon (section 6).
- [ ] The admin home page says “✓ Last backup … ago”, the backup job is on cron-job.org every 6 hours, and you have restored one into a scratch database at least once (section 6, “Backups”).
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
