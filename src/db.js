// Lightweight file-based data store.
//
// This is a small business record-keeping tool used by a handful of office
// staff, not a high-traffic web app, so a plain JSON file (loaded into memory
// and written back on every change) is simpler and more portable than
// running a separate database server, and it avoids native modules that can
// be painful to install on some hosts.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// When run inside the desktop app, electron/main.js sets DATA_DIR to a
// writable per-user folder (Electron's "userData" path) before this module
// is loaded, so the business data survives app updates/reinstalls and never
// needs write access to the app's install folder. Running the server
// directly (`npm start`, for development) falls back to a local ./data
// folder next to the project.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const COLLECTIONS = [
  'colonies',
  'plots',
  'plotPayments',
  'colonyMilestones',
  'colonyExpenses',
  'agriculturalLands',
  'agriculturalPayments',
  'shops',
  'shopPayments',
  'commercialLands',
  'commercialPayments',
];

function emptyStore() {
  const store = {};
  for (const name of COLLECTIONS) store[name] = [];
  return store;
}

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const fresh = emptyStore();
    fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw || '{}');
  } catch (err) {
    throw new Error(`data/db.json is corrupted and could not be parsed: ${err.message}`);
  }
  // Make sure every collection exists even if the file predates it.
  for (const name of COLLECTIONS) {
    if (!Array.isArray(parsed[name])) parsed[name] = [];
  }
  return parsed;
}

let store = load();

function persist() {
  // Write to a temp file first and rename, so a crash mid-write can never
  // leave db.json half-written / corrupted.
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2));
  fs.renameSync(tmpFile, DB_FILE);
}

function id() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function assertCollection(name) {
  if (!COLLECTIONS.includes(name)) {
    throw new Error(`Unknown collection: ${name}`);
  }
}

function list(collection, filterFn) {
  assertCollection(collection);
  const rows = store[collection];
  return filterFn ? rows.filter(filterFn) : rows.slice();
}

function get(collection, rowId) {
  assertCollection(collection);
  return store[collection].find((row) => row.id === rowId) || null;
}

function insert(collection, data) {
  assertCollection(collection);
  const row = Object.assign({ id: id(), createdAt: nowIso() }, data);
  store[collection].push(row);
  persist();
  return row;
}

function update(collection, rowId, patch) {
  assertCollection(collection);
  const row = get(collection, rowId);
  if (!row) return null;
  Object.assign(row, patch, { updatedAt: nowIso() });
  persist();
  return row;
}

function remove(collection, rowId) {
  assertCollection(collection);
  const idx = store[collection].findIndex((row) => row.id === rowId);
  if (idx === -1) return false;
  store[collection].splice(idx, 1);
  persist();
  return true;
}

// Remove every row in `collection` matching filterFn (used for cascading
// deletes, e.g. removing a colony's plots when the colony is deleted).
function removeWhere(collection, filterFn) {
  assertCollection(collection);
  const before = store[collection].length;
  store[collection] = store[collection].filter((row) => !filterFn(row));
  persist();
  return before - store[collection].length;
}

// Replaces every record with the contents of a backup file (used by the
// restore flow in src/backup.js). The backup is fully parsed and validated
// *before* db.json is touched, so a corrupt or unreadable backup file never
// damages the live data - it just throws and nothing changes.
function restoreFromFile(sourceFilePath) {
  const raw = fs.readFileSync(sourceFilePath, 'utf8');
  const parsed = JSON.parse(raw);
  for (const name of COLLECTIONS) {
    if (!Array.isArray(parsed[name])) parsed[name] = [];
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(parsed, null, 2));
  fs.renameSync(tmpFile, DB_FILE);
  store = parsed;
}

module.exports = { list, get, insert, update, remove, removeWhere, restoreFromFile, COLLECTIONS, DATA_DIR, DB_FILE };
