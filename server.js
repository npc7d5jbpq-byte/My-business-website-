require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const { checkCredentials, requireAuth } = require('./src/auth');
const { router: coloniesRouter } = require('./src/routes/colonies');
const dashboardRouter = require('./src/routes/dashboard');
const { createAssetRouter } = require('./src/routes/assetModule');

function buildApp() {
  const app = express();

  app.use(express.json());
  app.use(
    session({
      name: 'gco.sid',
      secret: process.env.SESSION_SECRET || 'change-this-to-a-long-random-string',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === 'true',
        maxAge: 1000 * 60 * 60 * 12, // 12 hours
      },
    })
  );

  // ---- Auth endpoints (open) ----
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!checkCredentials(username, password)) {
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }
    req.session.authenticated = true;
    req.session.username = username;
    res.json({ ok: true, username });
  });

  app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('gco.sid');
      res.json({ ok: true });
    });
  });

  app.get('/api/session', (req, res) => {
    if (req.session && req.session.authenticated) {
      return res.json({ authenticated: true, username: req.session.username });
    }
    res.json({ authenticated: false });
  });

  // ---- Protected API ----
  app.use('/api', requireAuth, coloniesRouter);
  app.use('/api', requireAuth, dashboardRouter);
  app.use('/api/agricultural', requireAuth, createAssetRouter({
    collection: 'agriculturalLands',
    paymentsCollection: 'agriculturalPayments',
    entityLabel: 'Agricultural land',
  }));
  app.use('/api/shops', requireAuth, createAssetRouter({
    collection: 'shops',
    paymentsCollection: 'shopPayments',
    entityLabel: 'Shop',
  }));
  app.use('/api/commercial', requireAuth, createAssetRouter({
    collection: 'commercialLands',
    paymentsCollection: 'commercialPayments',
    entityLabel: 'Commercial land/plot',
  }));

  // ---- Static frontend ----
  app.use(express.static(path.join(__dirname, 'public')));

  // Anything unmatched under /api is a genuine 404 (not the SPA fallback below).
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  return app;
}

// Starts listening and resolves with { server, port, url } once bound.
// Passing port 0 (used by the desktop app) asks the OS for any free port,
// which is read back from the bound server so there's never a "port already
// in use" conflict on the client's machine.
function start(port) {
  const app = buildApp();
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1');
    server.once('error', reject);
    server.once('listening', () => {
      const boundPort = server.address().port;
      resolve({ server, port: boundPort, url: `http://127.0.0.1:${boundPort}` });
    });
  });
}

module.exports = { buildApp, start };

// Running `node server.js` (or `npm start`) directly launches it as a
// regular web server on the configured port. The desktop app instead
// requires start() from electron/main.js and never reaches this block.
if (require.main === module) {
  start(process.env.PORT || 3000)
    .then(({ url }) => console.log(`Gulberg City Office system running at ${url}`))
    .catch((err) => {
      console.error('Failed to start server:', err.message);
      process.exit(1);
    });
}
