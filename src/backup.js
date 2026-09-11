// Automatic backup system.
//
// db.js already writes every single change straight to disk synchronously
// (see persist() there) - so normal data entry is never held only in
// memory and always survives the app closing, the computer restarting, or
// a crash. Backups here are the *second* line of defense: timestamped,
// independent snapshots that protect against accidental deletion in the
// app, a corrupted db.json, or the user needing to go back to an earlier
// point in time.
//
// Every backup cycle now also produces a plain, human-readable Excel
// export (src/export.js) alongside the JSON snapshot - "every step
// automatic", not something anyone has to remember to run separately. The
// JSON backup is what the app actually restores from (see restoreBackup()
// below); the Excel file is for opening in a spreadsheet program to
// actually read your data, not for restoring anything.
//
// All of that still lives on the same physical computer, though - so this
// module also supports mirroring both kinds of files to a *secondary*
// location (a USB drive, a network share, an external disk) if one is
// configured, so a full backup copy exists off that one machine too. That
// mirror is best-effort: if the drive isn't currently connected, syncing
// is skipped quietly and retried on the next cycle, rather than failing
// anything.

const fs = require('fs');
const path = require('path');
const db = require('./db');
const exportModule = require('./export');
const { loadSettings, saveSettings } = require('./settings');

// Backups live in a "backups" folder that is a *sibling* of the data
// folder (e.g. .../userData/data/db.json and .../userData/backups/*.json),
// so restoring or deleting a backup can never touch the live data file.
// The Excel exports live in their own sibling "exports" folder (see
// src/export.js's EXPORTS_DIR) for the same reason.
const BACKUPS_DIR = path.join(path.dirname(db.DATA_DIR), 'backups');
const EXPORTS_DIR = exportModule.EXPORTS_DIR;
// Files are mirrored into clearly-named subfolders on the secondary drive,
// rather than dumped in its root, since that drive may hold other things.
const SECONDARY_BACKUPS_SUBFOLDER = 'gulberg-city-office-backups';
const SECONDARY_EXPORTS_SUBFOLDER = 'gulberg-city-office-exports';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_MINUTES = 15;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function timestampForFilename(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, '-'); // e.g. 2026-09-09T12-15-00-000Z
}

function secondaryStatus() {
  const settings = loadSettings();
  const dir = settings.secondaryBackupDir || null;
  const reachable = Boolean(dir) && fs.existsSync(dir);
  return {
    configured: Boolean(dir),
    path: dir,
    reachable,
    lastSyncAt: settings.secondaryLastSyncAt || null,
    lastSyncCount: typeof settings.secondaryLastSyncCount === 'number' ? settings.secondaryLastSyncCount : null,
  };
}

// Validates the folder exists right now (it has to, to confirm this is a
// real, currently-connected location) and remembers it for future syncs,
// which tolerate it being disconnected later.
function setSecondaryDir(dirPath) {
  const trimmed = String(dirPath || '').trim();
  if (!trimmed) throw new Error('Please provide a folder path.');
  if (!fs.existsSync(trimmed) || !fs.statSync(trimmed).isDirectory()) {
    throw new Error('That folder could not be found. Make sure the drive is connected and the path is correct.');
  }
  saveSettings({ secondaryBackupDir: trimmed, secondaryLastSyncAt: null, secondaryLastSyncCount: null });
  return secondaryStatus();
}

function clearSecondaryDir() {
  saveSettings({ secondaryBackupDir: null, secondaryLastSyncAt: null, secondaryLastSyncCount: null });
  return secondaryStatus();
}

// Copies any file of the given extension that exists in `localDir` but not
// yet under `baseDir/subfolder`, then applies the same retention policy
// there too. Shared by both the JSON backups and the Excel exports below.
function syncDirToSecondary(baseDir, localDir, subfolder, ext) {
  const targetDir = path.join(baseDir, subfolder);
  ensureDir(targetDir);

  ensureDir(localDir);
  const localFiles = new Set(fs.readdirSync(localDir).filter((f) => f.endsWith(ext)));
  const remoteFiles = new Set(fs.readdirSync(targetDir).filter((f) => f.endsWith(ext)));

  let copied = 0;
  for (const f of localFiles) {
    if (remoteFiles.has(f)) continue;
    const dest = path.join(targetDir, f);
    const tmp = `${dest}.tmp`;
    fs.copyFileSync(path.join(localDir, f), tmp);
    fs.renameSync(tmp, dest);
    copied += 1;
  }

  applyRetention(Date.now(), targetDir, ext);
  return { copied, path: targetDir };
}

// Mirrors both the JSON backups and the Excel exports to the secondary
// drive/folder, if one is configured. Never throws - a disconnected or
// missing drive just means "skipped this time", tried again on the next
// cycle (or immediately via Sync Now).
function syncToSecondary() {
  const settings = loadSettings();
  const baseDir = settings.secondaryBackupDir;
  if (!baseDir) return { skipped: true, reason: 'not-configured' };
  if (!fs.existsSync(baseDir)) return { skipped: true, reason: 'not-reachable' };

  try {
    const backups = syncDirToSecondary(baseDir, BACKUPS_DIR, SECONDARY_BACKUPS_SUBFOLDER, '.json');
    const exports = syncDirToSecondary(baseDir, EXPORTS_DIR, SECONDARY_EXPORTS_SUBFOLDER, '.xlsx');
    const copied = backups.copied + exports.copied;
    saveSettings({ secondaryLastSyncAt: new Date().toISOString(), secondaryLastSyncCount: copied });
    return { skipped: false, copied, backupsCopied: backups.copied, exportsCopied: exports.copied, path: baseDir };
  } catch (err) {
    // e.g. drive removed mid-copy, or became read-only - treat like "not
    // reachable" rather than crashing anything.
    return { skipped: true, reason: 'error', message: err.message };
  }
}

// label identifies why the backup was taken: 'startup' | 'auto' | 'manual' |
// 'shutdown' | 'pre-restore'. Returns the filename, or null if there is no
// data yet to back up.
function takeBackup(label = 'auto') {
  ensureDir(BACKUPS_DIR);
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

// Takes a JSON backup AND a readable Excel export, prunes old copies of
// each, and mirrors both to the secondary location if one is configured -
// the full cycle run on every schedule tick, at startup/shutdown, and on
// demand. Async because generating the Excel workbook is (exceljs writes
// the file asynchronously) - every caller either awaits this or
// deliberately fires it in the background (see startScheduler below).
async function runBackupCycle(label) {
  const filename = takeBackup(label);
  applyRetention(Date.now(), BACKUPS_DIR, '.json');
  let exportFilename = null;
  try {
    exportFilename = await exportModule.takeExport(label);
    applyRetention(Date.now(), EXPORTS_DIR, '.xlsx');
  } catch (err) {
    // The Excel export is a convenience on top of the JSON backup above,
    // which has already succeeded by this point - never let a problem
    // building the spreadsheet (e.g. a locked file) look like the backup
    // itself failed.
    exportFilename = null;
  }
  const secondary = syncToSecondary();
  return { filename, exportFilename, secondary };
}

function listBackups() {
  ensureDir(BACKUPS_DIR);
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
// listBackups()). The current data is itself snapshotted first (JSON +
// Excel both), so an accidental or wrong restore can always be undone by
// restoring again.
async function restoreBackup(filename) {
  ensureDir(BACKUPS_DIR);
  const existing = new Set(fs.readdirSync(BACKUPS_DIR));
  if (!existing.has(filename)) {
    throw new Error('That backup file no longer exists.');
  }
  await runBackupCycle('pre-restore');
  db.restoreFromFile(path.join(BACKUPS_DIR, filename));
}

// Retention policy ("grandfather-father-son"): keeps things granular
// recently and coarser further back, so neither the backups folder nor the
// exports folder grows without bound. Used for JSON backups (.json) and
// Excel exports (.xlsx) alike, locally and on the mirrored secondary copy.
//   - every file from the last 48 hours
//   - one file per calendar day for the last 30 days
//   - one file per calendar month beyond that, kept indefinitely
function applyRetention(now = Date.now(), dir = BACKUPS_DIR, ext = '.json') {
  ensureDir(dir);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(ext));
  const entries = files
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
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
      try { fs.unlinkSync(path.join(dir, f)); } catch (err) { /* best-effort cleanup */ }
    }
  }
}

let timer = null;
let lastSeenMtime = null;

function dbFileMtime() {
  return fs.existsSync(db.DB_FILE) ? fs.statSync(db.DB_FILE).mtimeMs : null;
}

// Call once, after the server has started. Takes an immediate "startup"
// backup+export (so every session has a fresh recovery point) and then
// checks every `intervalMinutes` whether data has changed since the last
// backup, taking a new one only when it has. Either way, every tick also
// retries the secondary-drive sync, so a drive plugged in mid-session
// still picks up everything within one interval. Both the startup run and
// each tick fire in the background (not awaited) - nothing during normal
// operation should ever wait on a backup to finish; only shutdown does
// (see backupOnShutdown), so the last few minutes of edits are never lost.
function startScheduler({ intervalMinutes = DEFAULT_INTERVAL_MINUTES } = {}) {
  ensureDir(BACKUPS_DIR);
  runBackupCycle('startup').catch(() => {});
  lastSeenMtime = dbFileMtime();

  timer = setInterval(() => {
    const mtime = dbFileMtime();
    if (mtime !== null && mtime !== lastSeenMtime) {
      runBackupCycle('auto').catch(() => {});
      lastSeenMtime = mtime;
    } else {
      syncToSecondary(); // retry in case the drive was just connected
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
// Returns a Promise - callers MUST await this before actually exiting the
// process, otherwise the Excel export (written asynchronously) can be cut
// off mid-write.
function backupOnShutdown() {
  return runBackupCycle('shutdown');
}

module.exports = {
  BACKUPS_DIR,
  EXPORTS_DIR,
  takeBackup,
  runBackupCycle,
  listBackups,
  restoreBackup,
  applyRetention,
  startScheduler,
  stopScheduler,
  backupOnShutdown,
  secondaryStatus,
  setSecondaryDir,
  clearSecondaryDir,
  syncToSecondary,
};
