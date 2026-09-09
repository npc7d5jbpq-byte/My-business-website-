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
  profit.
- **Agricultural Land / Shops / Commercial Land & Plots** — record what was
  bought and from whom, track every payment made to the seller (and what's
  still payable), and — once resold — track every payment received from the
  buyer (and what's still receivable), plus profit on the sale.
- **Dashboard** — total money in, total money out, total receivable, total
  payable, net profit, and every upcoming or overdue payment/task across the
  whole business in one list.
- **Reports & Ledger** — year-by-year money in/out/net, and a full
  transaction ledger filterable by business line.
- **Automatic, scheduled, multi-copy backups** — see **Data Persistence &
  Backups** below for exactly where, how often, how many, and how to
  restore.

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

The username/password are the `ADMIN_USERNAME`/`ADMIN_PASSWORD` defaults in
`src/auth.js`. For the desktop app, edit those values there and rebuild the
installer. (They're only defaults — if you run this as a plain web server
instead, see below, they can also be overridden via a `.env` file without
touching code.)

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
src/backup.js            Automatic backup scheduler, retention policy, and restore
src/auth.js              Login check + route-protection middleware
src/finance.js           Shared money/date math (paid vs. pending, overdue, sums)
src/routes/colonies.js   Colonies, plots, milestones, development expenses
src/routes/assetModule.js  Shared buy/sell/payments logic for the 3 modules below
src/routes/dashboard.js  Cross-module totals, upcoming dues, yearly summary, ledger
src/routes/backups.js    Backup list/create/restore API
public/                  Frontend (plain HTML/CSS/JS, no build step required)
public/backups.html      Backups & Restore page
.github/workflows/       CI workflow that builds the Windows/macOS/Linux installers
```
