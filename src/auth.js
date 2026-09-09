const bcrypt = require('bcryptjs');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Gulberg City Office';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Maliha1234@#$';

// Hash the configured password once at startup rather than comparing plain
// strings on every request.
const ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

function checkCredentials(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') return false;
  if (username !== ADMIN_USERNAME) return false;
  return bcrypt.compareSync(password, ADMIN_PASSWORD_HASH);
}

// Blocks any request that doesn't have an authenticated session.
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.status(401).json({ error: 'Not authenticated. Please log in.' });
}

module.exports = { ADMIN_USERNAME, checkCredentials, requireAuth };
