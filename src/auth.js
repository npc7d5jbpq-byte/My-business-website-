const bcrypt = require('bcryptjs');
const { loadSettings, saveSettings } = require('./settings');

const MIN_PASSWORD_LENGTH = 6;

// The username/password only ever come from two places: whatever was set
// via the in-app Account Settings page (stored, hashed, in settings.json),
// or these defaults (env-overridable) the very first time the app runs.
const DEFAULT_USERNAME = process.env.ADMIN_USERNAME || 'Gulberg City Office';
const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD || 'Maliha1234@#$';
const DEFAULT_PASSWORD_HASH = bcrypt.hashSync(DEFAULT_PASSWORD, 10);

function getCredentials() {
  const settings = loadSettings();
  if (settings.authUsername && settings.authPasswordHash) {
    return { username: settings.authUsername, passwordHash: settings.authPasswordHash };
  }
  return { username: DEFAULT_USERNAME, passwordHash: DEFAULT_PASSWORD_HASH };
}

function getCurrentUsername() {
  return getCredentials().username;
}

function checkCredentials(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') return false;
  const current = getCredentials();
  if (username !== current.username) return false;
  return bcrypt.compareSync(password, current.passwordHash);
}

// Changes the login username and/or password. The current password must be
// supplied and correct (even though the request is already authenticated)
// as a safeguard against someone else using an unattended, still-logged-in
// session. Username always updates to newUsername; password only changes
// if newPassword is provided (blank/omitted keeps the current one).
function changeCredentials({ currentPassword, newUsername, newPassword }) {
  const current = getCredentials();
  if (typeof currentPassword !== 'string' || !bcrypt.compareSync(currentPassword, current.passwordHash)) {
    throw new Error('Current password is incorrect.');
  }
  const trimmedUsername = String(newUsername || '').trim();
  if (!trimmedUsername) {
    throw new Error('Username cannot be empty.');
  }
  const patch = { authUsername: trimmedUsername };
  if (newPassword) {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    patch.authPasswordHash = bcrypt.hashSync(newPassword, 10);
  } else {
    patch.authPasswordHash = current.passwordHash;
  }
  saveSettings(patch);
  return { username: trimmedUsername };
}

// Blocks any request that doesn't have an authenticated session.
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.status(401).json({ error: 'Not authenticated. Please log in.' });
}

module.exports = { checkCredentials, changeCredentials, getCurrentUsername, requireAuth };
