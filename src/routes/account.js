const express = require('express');
const auth = require('../auth');

const router = express.Router();

router.get('/account', (req, res) => {
  res.json({ username: auth.getCurrentUsername() });
});

router.post('/account/change-credentials', (req, res) => {
  const { currentPassword, newUsername, newPassword } = req.body || {};
  try {
    const result = auth.changeCredentials({ currentPassword, newUsername, newPassword });
    // Keep the current session valid, just reflect the new username on it.
    req.session.username = result.username;
    res.json({ ok: true, username: result.username });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
