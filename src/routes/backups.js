const express = require('express');
const path = require('path');
const db = require('../db');
const backup = require('../backup');
const exportModule = require('../export');

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
// computer to someone else) or just for peace of mind. Also takes a fresh
// Excel export (see src/export.js) and mirrors both (and anything else
// pending) to the secondary location if one is configured.
router.post('/backups', async (req, res) => {
  try {
    const { filename, exportFilename, secondary } = await backup.runBackupCycle('manual');
    if (!filename) return res.status(400).json({ error: 'There is no data yet to back up.' });
    res.status(201).json({ ok: true, filename, exportFilename, secondary });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Backup failed.' });
  }
});

router.post('/backups/:filename/restore', async (req, res) => {
  try {
    await backup.restoreBackup(req.params.filename);
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

// ---- Excel exports (plain, readable copies of the data - see src/export.js) ----
//
// Generated automatically on the exact same schedule as the JSON backups
// above (src/backup.js's runBackupCycle calls both), so this list fills
// itself in without anyone needing to run anything - these two endpoints
// exist for browsing that history and taking one on demand, same as the
// JSON backups' own "Backup Now".

router.get('/exports', (req, res) => {
  res.json({
    exportsDirectory: exportModule.EXPORTS_DIR,
    exports: exportModule.listExports(),
  });
});

router.post('/exports', async (req, res) => {
  try {
    const filename = await exportModule.takeExport('manual');
    if (!filename) return res.status(400).json({ error: 'There is no data yet to export.' });
    res.status(201).json({ ok: true, filename });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Export failed.' });
  }
});

router.get('/exports/:filename/download', (req, res) => {
  const filename = req.params.filename;
  // Only ever serve a file this module itself already knows about - never
  // resolve an arbitrary path from user input.
  const known = exportModule.listExports().find((e) => e.filename === filename);
  if (!known) return res.status(404).json({ error: 'That export could not be found.' });
  res.download(path.join(exportModule.EXPORTS_DIR, filename), filename);
});

module.exports = router;
