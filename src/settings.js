// A single small JSON file for app-level settings that aren't business data
// - the secondary backup location (src/backup.js) and the login username/
// password (src/auth.js) both live here. Kept separate from data/db.json so
// a data restore never touches account settings and vice versa.

const fs = require('fs');
const path = require('path');
const db = require('./db');

const SETTINGS_FILE = path.join(path.dirname(db.DATA_DIR), 'settings.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

function saveSettings(patch) {
  const merged = Object.assign(loadSettings(), patch);
  ensureDir(path.dirname(SETTINGS_FILE));
  const tmp = `${SETTINGS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2));
  fs.renameSync(tmp, SETTINGS_FILE);
  return merged;
}

module.exports = { loadSettings, saveSettings, SETTINGS_FILE };
