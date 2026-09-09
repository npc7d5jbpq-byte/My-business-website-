require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const { checkCredentials, requireAuth } = require('./src/auth');
const { router: coloniesRouter } = require('./src/routes/colonies');
const dashboardRouter = require('./src/routes/dashboard');
const { createAssetRouter } = require('./src/routes/assetModule');

const app = express();
const PORT = process.env.PORT || 3000;

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

app.listen(PORT, () => {
  console.log(`Gulberg City Office system running at http://localhost:${PORT}`);
});
