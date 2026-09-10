# Gulberg City Office — Property Record & Ledger System

A password-protected **desktop application** for managing the office's real
estate business: commercial colonies (plots, buyers, installments,
development milestones and expenses), agricultural land, shops, and
commercial land/plots — every one bought, sold and tracked to the rupee.

It runs entirely on the office computer. No internet connection, server, or
technical setup is needed to use it day to day — all data stays on that one
machine.

## What it does

- **Login-protected** — only someone with the office username/password can
  open the app.
- **Commercial Colonies** — add a colony, add its plots, assign a buyer to a
  plot, record every installment they pay (and what's still owed), plan
  development milestones with target dates, log development expenses, and see
  at a glance how many plots are sold/reserved/available and the colony's
  profit. Every plot has its **own dedicated page** (open it from the plots
  table) with its own dimensions, buyer info, and full payment history —
  completely separate from every other plot, the same way every colony,
  broker and land/shop/commercial record already gets its own page.
- **Agricultural Land / Shops / Commercial Land & Plots** — record what was
  bought and from whom, track every payment made to the seller (and what's
  still payable), and — once resold — track every payment received from the
  buyer (and what's still receivable), plus profit on the sale. Each record
  also has its own dedicated page (its own tiles, dimensions, and full
  payment history), reached via **Open** from its list.
- **Dimensions in feet** — every colony plot and every agricultural/shop/
  commercial record can record its **Front** and **Length/Depth in feet**,
  alongside the existing size/area fields.
- **Payment method on every payment** — every single payment, every
  installment-plan entry, and every "Mark Paid" action can record how it
  was actually settled: **Cash**, **Pay Order** (with its number), or
  **Cheque** (with its number), which **bank** it went through, and **Paid
  By** — who actually handed over or received the money, when that's
  someone other than the buyer/seller/broker on record (a relative, a
  partner settling on someone's behalf, etc.). Shown on the payment's row,
  and on its printed receipt.
- **Late payments keep their history** — "Mark Paid" never overwrites the
  originally-promised due date; it only records the *actual* date money
  changed hands (which the office can set to any date, not just today) and
  how it was paid. So if a payment was due on the 22nd but only came in on
  the 27th, both dates stay on record — nothing has to be deleted and
  re-added to reflect what really happened.
- **Missed payments can be rescheduled without losing history** — if a
  payment wasn't given or received at all on its due date, **Reschedule**
  (next to Mark Paid on any pending installment) asks for the new expected
  date and keeps the original installment on record, clearly marked
  "Missed — Rescheduled", while a fresh pending installment is created for
  the new date. Nothing is deleted or silently overwritten — the missed
  promise and the new one both stay visible.
- **Selling on installments works everywhere, not just in colonies** —
  Agricultural Land, Shops and Commercial Land & Plots can be sold on an
  upfront + installments schedule too, exactly like a colony plot: marking
  a record "Sold" goes straight into the same installment-plan builder used
  everywhere else (upfront/bayana now, the rest due later), and every
  installment it creates has the full set of tools — Print, Mark Done,
  Reschedule, payment method/Paid By — the same as any other payment.
- **A sale that falls through can be Cancelled, not just Deleted** — the
  same distinction as Brokers Commission's deal cancellation, applied to
  colony plots and to agricultural/shop/commercial sales: **Cancel Sale**
  voids the sale (it stops counting as owed/receivable, and its projected
  profit drops out) while keeping the buyer, the price, and every payment
  already made on record with a "Cancelled" badge and an optional reason -
  **Delete** remains the separate, permanent action that erases the record
  entirely. **Reactivate** undoes a cancellation made by mistake. Money the
  buyer already paid before the cancellation is never lost from the books -
  it stays counted as real cash received, only the future expectation goes
  away.
- **Brokers Commission** — every broker gets their own page listing every
  deal they earned a commission on separately, each with its own commission
  amount and its own payment schedule (a broker is very often paid their
  cut in installments too — some now, some after a few days, the rest
  later — so it uses the same installment-plan builder as the other
  modules, just counting in days instead of months). Each broker's page
  shows their total commission across every deal, how much has actually
  been handed to them, and how much is still owed — and it feeds into the
  Dashboard and Reports/Ledger the same way every other module does.
  A broker can also be given an **advance** — cash on credit, ahead of any
  specific deal — and later, a deal's commission can be settled partly or
  fully by drawing down that advance instead of a fresh payment (pick
  "Offset from Advance" when settling). The broker's page always shows the
  outstanding advance balance — how much of it they still haven't earned
  back through commission, i.e. what they'd owe the office if no more deals
  came in. A deal that falls through can be **Cancelled** (voids its
  commission — it stops counting as owed — while keeping the deal itself,
  its reason, and any commission already paid on record) rather than
  **Deleted** (which erases it entirely); a cancelled deal can be
  reactivated again if that was a mistake.
- **Dashboard** — total money in, total money out, total receivable, total
  payable, net profit, every upcoming or overdue payment/task across the
  whole business (including broker commissions) in one list, a
  **"Money to Be Given — Upcoming"** breakdown showing how much needs to be
  paid out within the next 15 days / 1 / 3 / 6 / 15 / 18 months and the
  next year (each figure cumulative — deliberately **excluding broker
  commissions**, which are tracked on their own separate schedule under
  Brokers Commission instead), and the mirror image, **"Money to Be
  Received — Upcoming"**, showing every colony plot installment and
  asset-sale payment still expected from a buyer within the next 15 days /
  1 / 3 / 6 / 9 months / 1 year / 15 / 18 months (cancelled sales excluded,
  same cumulative-per-horizon idea).
- **Reports & Ledger** — a "Growth at a Glance" comparison of this month vs
  last month and this year vs last year, a full year-by-year and
  month-by-month money in/out/net breakdown (each row showing its growth
  versus the previous period), and a full transaction ledger filterable by
  business line.
- **Printable receipts** — every payment (a plot installment, or a paid/
  received entry on agricultural land, a shop, or commercial land) has a
  **Print** button that opens a receipt formatted for a small **80mm
  receipt/thermal printer** — the narrow roll-paper printers used at shop
  and restaurant counters: business name, receipt number, date, buyer/
  seller, what was sold, this payment plus total price/paid/remaining, and
  signature lines. It prints on any printer connected to the computer via
  the normal Windows print dialog (Print → pick your printer), thermal or
  a regular A4/letter printer alike — no special driver or printer-
  integration code needed beyond installing the printer in Windows itself,
  the way you would for any other program.
- **Automatic, scheduled, multi-copy backups** — see **Data Persistence &
  Backups** below for exactly where, how often, how many, and how to
  restore.
- **Cash Position — by payment method** — on **Reports & Ledger**, a table
  that buckets every settled payment across the whole office (colony
  plots, colony expenses, agricultural/shops/commercial, broker
  commissions and advances) by how it was actually paid — **Cash**, each
  named **bank** (from Pay Order/Cheque payments), and **Not Specified** —
  showing total in, total out, and the running balance for each. Use it to
  reconcile what's actually sitting in the drawer or in a bank account
  against what the records say should be there. A broker advance offset
  (drawing down an existing advance to settle commission) is correctly
  excluded from this, since no new cash actually moves when that happens.
- **Commission as a % of deal value** — a broker deal can record a
  **Commission %** alongside its deal value, and the commission amount
  fills itself in automatically (deal value × percent ÷ 100) as either
  field is typed — no manual math. The amount field stays a normal,
  directly-editable field the whole time, so a broker paid a flat rupee
  amount instead of a percentage still works exactly as before. The
  broker's Deals table shows the percentage under the commission amount
  whenever one was used.
- **Global search** — one search box at the top of every page, searching a
  name, phone number, CNIC, or plot number across colonies, colony plots,
  agricultural land, shops, commercial land & plots, and brokers at once.
  Start typing (2+ characters) and matching records drop down instantly;
  click one to go straight to its page.
- **Full Statement printout** — beyond a single payment's receipt, every
  plot, agricultural/shop/commercial record, and broker deal has a
  **Print Full Statement** button that opens a full-page (A4) printout of
  its *entire* payment history — every installment, paid and pending, with
  due dates, paid/received dates, status, payment method, and running
  totals — plus signature lines. For an agricultural/shop/commercial
  record that's been both bought and resold, it prints both sides (paid to
  the seller, received from the buyer) on the same page. Useful whenever a
  buyer disputes how much they've actually paid so far.
- **Unified person view** — click any buyer, seller, or broker's name
  anywhere in the app (it's underlined) to open one page showing every
  deal they've ever had with the office, across every module at once — a
  colony plot they bought, agricultural land they sold to the office, a
  broker profile, all in one place, each with a link straight to that
  record.
- **Document attachments** — attach scanned paperwork (a CNIC, a sale
  agreement, a registry copy — any file type, up to 20MB) directly to a
  colony, a plot, an agricultural/shop/commercial record, a broker, or a
  person, via a **Documents** section on that record's own page. Click a
  document to view it (images and PDFs open right in the browser tab;
  anything else downloads) or delete it. Deleting a colony/plot/record/
  broker also deletes whatever was attached to it. These files live in the
  data folder alongside `db.json` but are **not** included in the automatic
  JSON snapshot backups described below — a full copy of the data folder
  captures them the same way it would capture `db.json` itself.
- **Price-per-Marla calculator, with a discount option** — on a colony
  plot (Add/Edit) or a Mark Sold form (agricultural land/shops/commercial),
  an optional calculator fills in the price automatically: enter the
  **Size** (in Marla, Kanal, or Acre — 1 Kanal = 20 Marla, 1 Acre =
  160 Marla) and a **Price per Marla**, and the price field fills itself in
  (still directly editable/overridable, exactly like the commission %
  calculator). An optional **Discount**, if given, is subtracted from that
  computed price — and is shown/printed on that plot/record's receipt and
  full statement whenever one was given (list price, discount, and the
  final price after discount, all three). A colony's Plots table also gets
  a **Price/Marla** column, computed fresh from each plot's actual price
  ÷ size (so it reflects any discount actually given, not just the rate
  originally typed in) with a flag when a plot is 10%+ above or below the
  colony's average rate — an under- or over-priced plot stands out at a
  glance.

## Data Persistence & Backups

**Primary storage — never in-memory, never lost on close/restart.** Every
single add/edit/delete is written straight to a file on disk the instant it
happens (`data/db.json` under the app's per-user data folder — see
"Where your data lives" below). Nothing is held only in memory waiting to be
saved later, so closing the app, restarting or shutting down the computer,
or even a crash, does not lose data — whatever was last saved is exactly
what's there next time the app opens. This part required no new work; it's
how the app has always stored data.

**Automatic backups — on top of that.** The app also takes independent,
timestamped snapshot copies automatically, as a safety net against things
that don't just delete/rewrite that live file. Handled by `src/backup.js`
and covered by the tests in this repo's history:

| Question | Answer |
|---|---|
| **Where is production data stored?** | `data/db.json` inside the app's OS-assigned per-user data folder (e.g. `%APPDATA%\gulberg-city-office-erp\data\db.json` on Windows, `~/Library/Application Support/gulberg-city-office-erp/data/db.json` on macOS, `~/.config/gulberg-city-office-erp/data/db.json` on Linux) — never inside the installed app folder, so an app update/reinstall never touches it. |
| **Where are backups stored?** | A `backups` folder next to (a sibling of) the data folder, e.g. `%APPDATA%\gulberg-city-office-erp\backups\` — visible in-app on the **Backups & Restore** page, or via the desktop app's **File → Open Automatic Backups Folder**. |
| **How often are backups taken?** | Once immediately whenever the app starts; every **15 minutes** while it's running, but only if something actually changed since the last backup (no pointless duplicate copies); once more when the app is closed. A **Backup Now** button on the Backups & Restore page also takes one on demand at any time. |
| **How many copies are retained?** | A rolling ("grandfather-father-son") policy so the folder never grows without bound: **every** backup from the **last 48 hours**, **one per calendar day** for the **last 30 days**, and **one per calendar month** after that, kept **indefinitely**. Each snapshot is a small JSON file (typically KB, not MB), so even years of monthly backups stay negligible in size. |
| **How does restoring work?** | Open the **Backups & Restore** page in the app, pick any backup from the list (each shows its date/time, whether it was automatic or manual, and its size), click **Restore this backup**, and confirm. The app automatically snapshots the *current* data first (labeled "Safety copy (before a restore)") before overwriting anything, so a restore is itself always reversible by restoring again. No restart is needed — the app reloads with the restored data immediately. |

**Secondary (off-machine) backup location.** Everything above still lives on
the one computer running the app — if its hard drive fails, both the data
and its backups are gone together. To close that gap, point the app at a
USB drive or a network folder (**Backups & Restore** page, or the desktop
app's **File → Set Secondary Backup Location (USB / Network)…**, which opens
a native folder picker) and every backup is automatically mirrored there too
from then on, with no manual copying required:

- Every backup cycle (startup, the 15-minute auto-check, shutdown, manual,
  pre-restore) also copies any backup file not yet on that drive over to it,
  into a `gulberg-city-office-backups` subfolder so it doesn't clutter a
  drive used for other things too.
- If the drive isn't plugged in at the time, syncing is **skipped silently**
  (never blocks or fails the local backup) and retried automatically on the
  next cycle, or immediately via **Sync Now**.
- The same 48-hour/30-day/monthly retention policy applies there too, so the
  secondary drive doesn't fill up either.
- The Backups & Restore page shows whether it's currently connected, the
  path, and when it last synced.
- **Known limitation:** a USB drive can be assigned a different letter
  (e.g. `E:` one time, `F:` the next) depending on what else is plugged in,
  which would make the app treat it as "disconnected" until re-pointed at
  the new letter. For a more reliable target, prefer a network folder path,
  or a USB drive that's always the only one plugged in.

This was built, then verified directly (not just written and assumed
correct) before being reported here:
- Confirmed a "startup" backup is created the moment the app starts.
- Confirmed an "auto" backup appears after data changes once the interval
  elapses, and does **not** appear again if nothing changed.
- Confirmed **Backup Now** creates an on-demand copy immediately.
- Confirmed restoring an older backup actually replaces the live data (a
  colony created after that backup disappeared after restoring to it), and
  that a "pre-restore" safety copy of the pre-restore state was created
  automatically.
- Confirmed restoring a nonexistent/invalid filename fails safely with no
  changes made, including a path-traversal attempt (`../../etc/passwd`),
  which is rejected because restore only ever accepts a filename that
  already exists in the backups folder — it never opens an arbitrary path.
- Unit-tested the retention policy directly against synthetic timestamps
  spanning 14 months of daily backups: confirmed every backup within 48
  hours survives, exactly one per calendar day survives for the 2-30 day
  range, and exactly one per calendar month survives beyond that.
- Confirmed setting a secondary location rejects a folder that doesn't
  exist, and accepts and immediately syncs to one that does.
- Confirmed a backup taken while the secondary drive is disconnected is
  skipped gracefully (no error, no crash), and that reconnecting it and
  syncing picks up everything that was missed while it was away.

**In short:** data is durable from the moment it's entered (synchronous
disk writes, not in-memory), and is additionally protected by automatic
snapshots on a schedule with bounded, sensible retention and an in-app
restore flow — all running locally, all confirmed working before being
described here.

## Installing it on the office computer

Someone building the app (see **Building the installer** below) will hand
you an installer file:

- **Windows:** `Gulberg City Office Setup.exe` — run it and follow the
  prompts. It adds a desktop icon and Start Menu entry.
- **macOS:** `Gulberg City Office.dmg` — open it and drag the app to
  Applications.
- **Linux:** `Gulberg City Office.AppImage` — make it executable and run it.

After installing, just double-click the icon to open the app — it looks and
behaves like any other desktop program (Word, Excel, etc.), with its own
window and menu. Sign in with the username and password you were given.

**Where your data lives:** everything you enter is saved automatically to a
file on this computer (not on the internet), in a folder Windows/macOS/Linux
sets aside for the app's own data — this is separate from wherever the app
itself is installed, so reinstalling or updating the app never touches your
data. The app also takes automatic backups on a schedule (see **Data
Persistence & Backups** above for exactly where/how often/how many/how to
restore). Use **File → Open Data Folder** or the in-app **Backups &
Restore** page to see everything, and **File → Backup Data As…**
occasionally to save an extra copy somewhere else entirely (a USB drive, an
email to yourself, a cloud folder) — since the automatic backups above,
useful as they are, still live on this same computer.

## Building the installer (for whoever maintains this app)

You need [Node.js](https://nodejs.org) 18+ only for building — the office
computer running the finished installer does not need Node.js installed.

```bash
npm install
npm run dist:win     # -> release/Gulberg City Office Setup.exe
npm run dist:mac     # -> release/Gulberg City Office.dmg   (must be run on a Mac)
npm run dist:linux   # -> release/Gulberg City Office.AppImage
```

electron-builder can only produce a Windows build on Windows/Linux, and a
macOS build only on a Mac. If you're not on Windows, the easiest way to get
the `.exe` is the included GitHub Actions workflow
(`.github/workflows/build-desktop-app.yml`): open this repository on GitHub
→ **Actions** tab → **Build Desktop App** → **Run workflow**. A few minutes
later the finished Windows, macOS and Linux installers are attached to that
workflow run as downloadable artifacts.

## Changing the login

Sign in, then go to **Account Settings** in the sidebar (or **File → Account
Settings…** in the desktop app's menu). Enter the current password plus the
new username/password and save — no rebuild, no code changes, and it takes
effect immediately (the current session stays logged in; anyone signing in
after that needs the new credentials). The new password is stored hashed,
never in plain text.

`ADMIN_USERNAME`/`ADMIN_PASSWORD` in `src/auth.js` (overridable via a
`.env` file when running as a plain web server) are only the *first-run*
defaults, used until a password is set via Account Settings for the first
time — after that, whatever was saved there always takes precedence.

## Using it on a phone (iPhone / Android)

The web app (same one the desktop app wraps) is a installable **PWA**
(Progressive Web App): open it in Safari on an iPhone, tap **Share → Add to
Home Screen**, and it gets its own icon and opens full-screen like a regular
app, with its login/dashboard/etc. shell caching for faster repeat loads.

**Important - what this is and isn't:** it is not a native App Store app,
and it does not carry its own separate copy of the data. To load anything,
the phone still needs network access to a running instance of this same
server - either:
- the office computer, if the phone is on the same Wi-Fi network (open
  `http://<that PC's local IP>:<port>` in Safari first, then Add to Home
  Screen so the shortcut remembers that address), or
- a version of this app hosted somewhere reachable from anywhere (a small
  cloud server), if you want access away from the office network too.

Ledger data is deliberately kept in one place (see **Data Persistence &
Backups** above) rather than duplicated onto a phone, so there's only ever
one source of truth to back up and trust. A true offline-capable native iOS
app with its own local copy would be a materially bigger, separate project
(Swift/SwiftUI, Xcode, an Apple Developer account, and a sync strategy
between phone and office copies) - ask if that's what's actually wanted and
it can be scoped properly rather than half-built here.

## Running it as a plain web server instead (optional, for development)

The desktop app is just this same web app wrapped in a native window. You
can also run it directly with Node.js — handy while developing:

```bash
npm install
cp .env.example .env    # then edit .env to change the login or port
npm start
```

Open `http://localhost:3000` and sign in. Data is stored in `data/db.json`
next to the project in this mode. `npm run dev` restarts automatically when
a file changes.

## Project structure

```
electron/main.js         Desktop app entry point (window, menu, backup/open-data-folder)
server.js                Express app (shared by the desktop app and plain `npm start`)
src/db.js                Simple JSON file data store (no external database needed)
src/settings.js          Shared small-settings file (secondary backup location, login credentials)
src/backup.js            Automatic backup scheduler, retention policy, and restore
src/auth.js              Login check, in-app credential changes, route-protection middleware
src/finance.js           Shared money/date math (paid vs. pending, overdue, sums)
src/routes/colonies.js   Colonies, plots, milestones, development expenses
src/routes/assetModule.js  Shared buy/sell/payments logic for the 3 modules below
src/routes/brokers.js    Brokers, their deals, and each deal's commission payments
src/routes/dashboard.js  Cross-module totals, upcoming dues, yearly/monthly summary, ledger, cash position
src/routes/directory.js  Global search and the unified person-view lookup, across every module
src/routes/attachments.js  Document attachments: upload/list/download/delete, cascade-delete on parent delete
src/routes/backups.js    Backup list/create/restore API
src/routes/account.js    Change username/password API
public/                  Frontend (plain HTML/CSS/JS, no build step required)
public/plot.html         A single colony plot's own dedicated page (dimensions, payments)
public/asset-detail.html A single agricultural/shop/commercial record's own dedicated page
public/statement.html    Full payment-history statement printout (A4) for a plot/record/deal
public/person.html       Unified person view — every deal one person has, across every module
public/backups.html      Backups & Restore page
public/account.html      Account Settings (change username/password) page
.github/workflows/       CI workflow that builds the Windows/macOS/Linux installers
```
