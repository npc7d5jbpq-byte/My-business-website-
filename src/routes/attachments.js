// Scanned paperwork (a CNIC, a sale agreement, a registry copy) attached
// directly to the record it belongs to - a colony, a plot, an
// agricultural/shop/commercial record, a broker, or a person (matched by
// name, the same way the Unified Person View is) - so the paperwork lives
// right next to the numbers instead of in a separate folder somewhere.
//
// Files are stored as plain files on disk under DATA_DIR/attachments,
// named by a random id (never the original filename, to avoid any path-
// traversal or collision risk) with metadata - which record it belongs
// to, the original filename, its type/size - tracked in the normal
// JSON store like everything else.
//
// Note: these files live in the data folder but are NOT included in the
// automatic JSON snapshot backups (src/backup.js only snapshots db.json,
// which would be far heavier to do every cycle if it had to copy every
// attached file too) - a full copy of the data folder captures them, the
// same way it would capture db.json itself.

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');

const router = express.Router();

const ATTACHMENTS_DIR = path.join(db.DATA_DIR, 'attachments');

const ALLOWED_PARENT_TYPES = new Set(['colony', 'plot', 'agricultural', 'shops', 'commercial', 'broker', 'person']);

// Generous for a scanned photo or PDF, small enough not to quietly bloat
// the data folder into something backups/restores struggle with.
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
    cb(null, ATTACHMENTS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: MAX_FILE_SIZE } });

function norm(s) {
  return String(s || '').toLowerCase().trim();
}

function resolveParentId(parentType, parentId) {
  return parentType === 'person' ? norm(parentId) : String(parentId || '').trim();
}

router.post('/attachments', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (20MB max).' : (err.message || 'Upload failed.');
      return res.status(400).json({ error: message });
    }
    const { parentType, parentId, label, notes } = req.body;
    const cleanup = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
    if (!ALLOWED_PARENT_TYPES.has(parentType)) {
      cleanup();
      return res.status(400).json({ error: 'Unknown record type.' });
    }
    const pid = resolveParentId(parentType, parentId);
    if (!pid) {
      cleanup();
      return res.status(400).json({ error: 'Missing record reference.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Choose a file to upload.' });
    }
    const attachment = db.insert('attachments', {
      parentType,
      parentId: pid,
      label: (label || '').trim(),
      notes: notes || '',
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype || 'application/octet-stream',
      size: req.file.size,
    });
    res.status(201).json(attachment);
  });
});

router.get('/attachments', (req, res) => {
  const { parentType, parentId } = req.query;
  if (!ALLOWED_PARENT_TYPES.has(parentType) || !parentId) return res.json([]);
  const pid = resolveParentId(parentType, parentId);
  const rows = db
    .list('attachments', (a) => a.parentType === parentType && a.parentId === pid)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(rows);
});

router.get('/attachments/:id/file', (req, res) => {
  const row = db.get('attachments', req.params.id);
  if (!row) return res.status(404).json({ error: 'Attachment not found.' });
  const filePath = path.join(ATTACHMENTS_DIR, row.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'That file is missing on disk.' });
  // Images and PDFs open right in the browser tab; anything else (a Word
  // doc, say) downloads instead, since the browser can't render it inline.
  const inline = /^image\//.test(row.mimeType) || row.mimeType === 'application/pdf';
  const safeName = String(row.originalName || 'file').replace(/["\r\n]/g, '');
  res.setHeader('Content-Type', row.mimeType);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`);
  res.sendFile(filePath);
});

router.delete('/attachments/:id', (req, res) => {
  const row = db.get('attachments', req.params.id);
  if (!row) return res.status(404).json({ error: 'Attachment not found.' });
  fs.unlink(path.join(ATTACHMENTS_DIR, row.storedName), () => {}); // best-effort
  db.remove('attachments', row.id);
  res.json({ ok: true });
});

// Cascade-delete helper for when the record itself is deleted (a colony,
// a plot, an asset record, a broker) - called from those routers so an
// attachment never outlives the thing it was attached to. `parentIds` can
// be a single id or an array (a colony deletes cascade through its plots'
// ids too).
function removeAttachmentsFor(parentType, parentIds) {
  const ids = new Set(Array.isArray(parentIds) ? parentIds : [parentIds]);
  const rows = db.list('attachments', (a) => a.parentType === parentType && ids.has(a.parentId));
  for (const row of rows) {
    fs.unlink(path.join(ATTACHMENTS_DIR, row.storedName), () => {});
    db.remove('attachments', row.id);
  }
}

module.exports = { router, removeAttachmentsFor };
