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
- **One-click backup** — File → Backup Data As… saves a copy of everything
  to a USB drive, cloud folder, etc.

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
data. Use **File → Open Data Folder** in the app to see it, and **File →
Backup Data As…** regularly to save a safety copy somewhere else (a USB
drive, an email to yourself, a cloud folder) — that backup file is the only
copy of your records outside this one computer.

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
src/auth.js              Login check + route-protection middleware
src/finance.js           Shared money/date math (paid vs. pending, overdue, sums)
src/routes/colonies.js   Colonies, plots, milestones, development expenses
src/routes/assetModule.js  Shared buy/sell/payments logic for the 3 modules below
src/routes/dashboard.js  Cross-module totals, upcoming dues, yearly summary, ledger
public/                  Frontend (plain HTML/CSS/JS, no build step required)
.github/workflows/       CI workflow that builds the Windows/macOS/Linux installers
```
