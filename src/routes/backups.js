const express = require('express');
const db = require('../db');
const backup = require('../backup');

const router = express.Router();

router.get('/backups', (req, res) => {
  res.json({
    dataFile: db.DB_FILE,
    backupsDirectory: backup.BACKUPS_DIR,
    backups: backup.listBackups(),
  });
});

// Takes an on-demand snapshot right now, independent of the automatic
// schedule - useful before something risky (bulk edits, handing the
// computer to someone else) or just for peace of mind.
router.post('/backups', (req, res) => {
  const filename = backup.takeBackup('manual');
  if (!filename) return res.status(400).json({ error: 'There is no data yet to back up.' });
  res.status(201).json({ ok: true, filename });
});

router.post('/backups/:filename/restore', (req, res) => {
  try {
    backup.restoreBackup(req.params.filename);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
