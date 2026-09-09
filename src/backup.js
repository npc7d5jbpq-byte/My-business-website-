// Automatic backup system.
//
// db.js already writes every single change straight to disk synchronously
// (see persist() there) - so normal data entry is never held only in
// memory and always survives the app closing, the computer restarting, or
// a crash. Backups here are the *second* line of defense: timestamped,
// independent snapshots that protect against accidental deletion in the
// app, a corrupted db.json, or the user needing to go back to an earlier
// point in time.

const fs = require('fs');
const path = require('path');
const db = require('./db');

// Backups live in a "backups" folder that is a *sibling* of the data
// folder (e.g. .../userData/data/db.json and .../userData/backups/*.json),
// so restoring or deleting a backup can never touch the live data file.
const BACKUPS_DIR = path.join(path.dirname(db.DATA_DIR), 'backups');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_MINUTES = 15;

function ensureDir() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

function timestampForFilename(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, '-'); // e.g. 2026-09-09T12-15-00-000Z
}

// label identifies why the backup was taken: 'startup' | 'auto' | 'manual' |
// 'shutdown' | 'pre-restore'. Returns the filename, or null if there is no
// data yet to back up.
function takeBackup(label = 'auto') {
  ensureDir();
  if (!fs.existsSync(db.DB_FILE)) return null;
  // "__" (rather than "-") separates the label from the timestamp because
  // labels like "pre-restore" already contain a hyphen.
  const filename = `${label}__${timestampForFilename()}.json`;
  const dest = path.join(BACKUPS_DIR, filename);
  const tmp = `${dest}.tmp`;
  fs.copyFileSync(db.DB_FILE, tmp);
  fs.renameSync(tmp, dest);
  return filename;
}

function listBackups() {
  ensureDir();
  return fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUPS_DIR, f));
      return {
        filename: f,
        label: f.split('__')[0],
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Restores the given backup (by filename, must be one already listed by
// listBackups()). The current data is itself snapshotted first, so an
// accidental or wrong restore can always be undone by restoring again.
function restoreBackup(filename) {
  ensureDir();
  const existing = new Set(fs.readdirSync(BACKUPS_DIR));
  if (!existing.has(filename)) {
    throw new Error('That backup file no longer exists.');
  }
  takeBackup('pre-restore');
  db.restoreFromFile(path.join(BACKUPS_DIR, filename));
}

// Retention policy ("grandfather-father-son"): keeps things granular
// recently and coarser further back, so the backup folder stays small
// forever instead of growing without bound.
//   - every backup from the last 48 hours
//   - one backup per calendar day for the last 30 days
//   - one backup per calendar month beyond that, kept indefinitely
function applyRetention(now = Date.now()) {
  ensureDir();
  const files = fs.readdirSync(BACKUPS_DIR).filter((f) => f.endsWith('.json'));
  const entries = files
    .map((f) => ({ f, mtime: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }))
    .sort((a, b) => a.mtime - b.mtime);

  const keep = new Set();
  const latestPerDay = new Map();
  const latestPerMonth = new Map();

  for (const { f, mtime } of entries) {
    const age = now - mtime;
    if (age <= 2 * DAY_MS) {
      keep.add(f);
      continue;
    }
    const iso = new Date(mtime).toISOString();
    if (age <= 30 * DAY_MS) {
      latestPerDay.set(iso.slice(0, 10), f); // overwritten as we scan forward in time -> keeps the latest of that day
    } else {
      latestPerMonth.set(iso.slice(0, 7), f); // keeps the latest of that month
    }
  }
  for (const f of latestPerDay.values()) keep.add(f);
  for (const f of latestPerMonth.values()) keep.add(f);

  for (const f of files) {
    if (!keep.has(f)) {
      try { fs.unlinkSync(path.join(BACKUPS_DIR, f)); } catch (err) { /* best-effort cleanup */ }
    }
  }
}

let timer = null;
let lastSeenMtime = null;

function dbFileMtime() {
  return fs.existsSync(db.DB_FILE) ? fs.statSync(db.DB_FILE).mtimeMs : null;
}

// Call once, after the server has started. Takes an immediate "startup"
// backup (so every session has a fresh recovery point) and then checks
// every `intervalMinutes` whether data has changed since the last backup,
// taking a new one only when it has.
function startScheduler({ intervalMinutes = DEFAULT_INTERVAL_MINUTES } = {}) {
  ensureDir();
  takeBackup('startup');
  lastSeenMtime = dbFileMtime();
  applyRetention();

  timer = setInterval(() => {
    const mtime = dbFileMtime();
    if (mtime !== null && mtime !== lastSeenMtime) {
      takeBackup('auto');
      lastSeenMtime = mtime;
      applyRetention();
    }
  }, intervalMinutes * 60 * 1000);
  // A backup timer alone should never keep the process from exiting.
  if (timer.unref) timer.unref();
}

function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

// Call on graceful shutdown (Electron window close, or SIGINT/SIGTERM in
// standalone server mode) so the last few minutes of edits before closing
// are captured even if they happened inside the current backup interval.
function backupOnShutdown() {
  takeBackup('shutdown');
  applyRetention();
}

module.exports = {
  BACKUPS_DIR,
  takeBackup,
  listBackups,
  restoreBackup,
  applyRetention,
  startScheduler,
  stopScheduler,
  backupOnShutdown,
};
