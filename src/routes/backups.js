const express = require('express');
const db = require('../db');
const backup = require('../backup');

const router = express.Router();

router.get('/backups', (req, res) => {
  res.json({
    dataFile: db.DB_FILE,
    backupsDirectory: backup.BACKUPS_DIR,
    backups: backup.listBackups(),
    secondary: backup.secondaryStatus(),
  });
});

// Takes an on-demand snapshot right now, independent of the automatic
// schedule - useful before something risky (bulk edits, handing the
// computer to someone else) or just for peace of mind. Also mirrors it (and
// anything else pending) to the secondary location if one is configured.
router.post('/backups', (req, res) => {
  const { filename, secondary } = backup.runBackupCycle('manual');
  if (!filename) return res.status(400).json({ error: 'There is no data yet to back up.' });
  res.status(201).json({ ok: true, filename, secondary });
});

router.post('/backups/:filename/restore', (req, res) => {
  try {
    backup.restoreBackup(req.params.filename);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- Secondary backup location (USB drive / network folder) ----

router.post('/backups/secondary', (req, res) => {
  try {
    const status = backup.setSecondaryDir(req.body && req.body.path);
    const syncResult = backup.syncToSecondary();
    res.json({ ok: true, secondary: status, syncResult });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/backups/secondary', (req, res) => {
  res.json({ ok: true, secondary: backup.clearSecondaryDir() });
});

// Forces an immediate copy-over attempt right now (e.g. right after
// plugging the drive back in), instead of waiting for the next scheduled
// tick.
router.post('/backups/secondary/sync', (req, res) => {
  const result = backup.syncToSecondary();
  res.json({ ok: true, result, secondary: backup.secondaryStatus() });
});

module.exports = router;
