# Gulberg City Office — Property Record & Ledger System

A password-protected web application for managing the office's real estate
business: commercial colonies (plots, buyers, installments, development
milestones and expenses), agricultural land, shops, and commercial land/plots
— every one bought, sold and tracked to the rupee.

## What it does

- **Login-protected** — only someone with the office username/password can
  access any data.
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

## Running it

Requires [Node.js](https://nodejs.org) 18 or later.

```bash
npm install
cp .env.example .env    # then edit .env if you want to change the login or port
npm start
```

The app will be available at `http://localhost:3000` (or whatever `PORT` you
set in `.env`). Sign in with the username/password from `.env`
(`ADMIN_USERNAME` / `ADMIN_PASSWORD` — defaults to the credentials you were
given).

For day-to-day development, `npm run dev` restarts the server automatically
when a file changes.

## Where the data lives

All records are stored in `data/db.json`, created automatically the first
time the server runs. **Back this file up regularly** (copy it somewhere safe
— a USB drive, cloud storage, email it to yourself, etc.) since it is the
only copy of every colony, plot, land record and payment in the system. It is
deliberately excluded from git (`.gitignore`) so real business data is never
committed to source control.

## Deploying so the office can use it day to day

This is a normal Node.js web app, so it can run on any of the following
(most have a free tier that is more than enough for one office):

- A small VPS (DigitalOcean, Linode, etc.) — install Node, `npm install`,
  then keep it running with `pm2` or a `systemd` service.
- Render, Railway, or a similar "deploy from GitHub" host — point it at this
  repository, set the environment variables from `.env.example`, and it will
  build and run automatically. **Important:** on these platforms, attach a
  persistent disk/volume mounted at the `data/` folder, otherwise
  `data/db.json` will be wiped every time the app redeploys.
- A Windows/Linux PC in the office itself, left running, with the other
  computers on the same office network opening `http://<that PC's IP>:3000`
  in a browser.

Whichever option you use, change `SESSION_SECRET` in `.env` to a long random
value, and set `COOKIE_SECURE=true` once the site is served over HTTPS.

## Changing the login later

Edit `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env` and restart the server —
no code changes needed.

## Project structure

```
server.js               Express app entry point, session/auth wiring
src/db.js                Simple JSON file data store (no external database needed)
src/auth.js              Login check + route-protection middleware
src/finance.js           Shared money/date math (paid vs. pending, overdue, sums)
src/routes/colonies.js   Colonies, plots, milestones, development expenses
src/routes/assetModule.js  Shared buy/sell/payments logic for the 3 modules below
src/routes/dashboard.js  Cross-module totals, upcoming dues, yearly summary, ledger
public/                  Frontend (plain HTML/CSS/JS, no build step required)
data/db.json             All business data (created on first run, gitignored)
```
