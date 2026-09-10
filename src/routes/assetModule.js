// Agricultural land, shops, and commercial land/plots all follow the same
// "buy it, maybe sell it later, track every payment either way" shape, so
// they share one router factory instead of three near-identical files.

const express = require('express');
const db = require('../db');
const { sumAmount, settledRows, pendingRows, round2 } = require('../finance');

function computeAssetStats(entity, payments) {
  const totalPaid = round2(sumAmount(settledRows(payments, 'paid')));
  const totalPaidPending = round2(sumAmount(pendingRows(payments, 'paid')));
  const totalReceived = round2(sumAmount(settledRows(payments, 'received')));
  const totalReceivablePending = round2(sumAmount(pendingRows(payments, 'received')));

  const purchasePrice = Number(entity.purchasePrice) || 0;
  const salePrice = Number(entity.salePrice) || 0;

  const totalPayable = round2(purchasePrice - totalPaid); // still owed to the seller
  // A cancelled sale (status: 'cancelled', set after a sale falls through -
  // see the Cancel Sale action) is deliberately excluded here exactly like
  // a "not sold yet" entity: its projected receivable/profit no longer
  // count. Whatever the buyer already paid before it was cancelled stays
  // real, though, so it's never dropped from totalReceived or cashProfit
  // below - only the forward-looking numbers go to zero.
  const totalReceivable = entity.status === 'sold' ? round2(salePrice - totalReceived) : 0;
  const profit = entity.status === 'sold' ? round2(salePrice - purchasePrice) : 0;
  const cashProfit = round2(totalReceived - totalPaid);

  return {
    totalPaid,
    totalPaidPending,
    totalPayable,
    totalReceived,
    totalReceivablePending,
    totalReceivable,
    profit,
    cashProfit,
  };
}

function createAssetRouter({ collection, paymentsCollection, entityLabel }) {
  const router = express.Router();

  function withStats(entity) {
    const payments = db.list(paymentsCollection, (p) => p.parentId === entity.id);
    return Object.assign({}, entity, { stats: computeAssetStats(entity, payments) });
  }

  router.get('/', (req, res) => {
    const rows = db.list(collection).map(withStats);
    rows.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    res.json(rows);
  });

  router.post('/', (req, res) => {
    const { title, location, area, frontFt, lengthFt, purchasePrice, purchaseDate, sellerName, sellerPhone, notes } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: `${entityLabel} title/name is required.` });
    const entity = db.insert(collection, {
      title: String(title).trim(),
      location: location || '',
      area: area || '',
      frontFt: Number(frontFt) || 0,
      lengthFt: Number(lengthFt) || 0,
      purchasePrice: Number(purchasePrice) || 0,
      purchaseDate: purchaseDate || '',
      sellerName: sellerName || '',
      sellerPhone: sellerPhone || '',
      status: 'owned',
      previousStatus: '',
      cancelReason: '',
      salePrice: 0,
      saleDate: '',
      buyerName: '',
      buyerPhone: '',
      notes: notes || '',
    });
    res.status(201).json(entity);
  });

  router.get('/:id', (req, res) => {
    const entity = db.get(collection, req.params.id);
    if (!entity) return res.status(404).json({ error: `${entityLabel} not found.` });
    const payments = db
      .list(paymentsCollection, (p) => p.parentId === entity.id)
      .sort((a, b) => new Date(b.dueDate || b.paidDate || 0) - new Date(a.dueDate || a.paidDate || 0));
    res.json(Object.assign({}, entity, { stats: computeAssetStats(entity, payments), payments }));
  });

  router.put('/:id', (req, res) => {
    const entity = db.get(collection, req.params.id);
    if (!entity) return res.status(404).json({ error: `${entityLabel} not found.` });
    const fields = [
      'title', 'location', 'area', 'frontFt', 'lengthFt', 'purchasePrice', 'purchaseDate', 'sellerName', 'sellerPhone',
      'status', 'previousStatus', 'cancelReason', 'salePrice', 'saleDate', 'buyerName', 'buyerPhone', 'notes',
    ];
    const numeric = new Set(['purchasePrice', 'salePrice', 'frontFt', 'lengthFt']);
    const patch = {};
    for (const f of fields) {
      if (req.body[f] !== undefined) patch[f] = numeric.has(f) ? Number(req.body[f]) || 0 : req.body[f];
    }
    res.json(db.update(collection, req.params.id, patch));
  });

  router.delete('/:id', (req, res) => {
    const entity = db.get(collection, req.params.id);
    if (!entity) return res.status(404).json({ error: `${entityLabel} not found.` });
    db.removeWhere(paymentsCollection, (p) => p.parentId === entity.id);
    db.remove(collection, entity.id);
    res.json({ ok: true });
  });

  router.post('/:id/payments', (req, res) => {
    const entity = db.get(collection, req.params.id);
    if (!entity) return res.status(404).json({ error: `${entityLabel} not found.` });
    const { direction, amount, dueDate, paidDate, paidThrough, referenceNumber, bankName, paidBy, notes } = req.body;
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'A positive amount is required.' });
    if (direction !== 'paid' && direction !== 'received') {
      return res.status(400).json({ error: "direction must be 'paid' or 'received'." });
    }
    const payment = db.insert(paymentsCollection, {
      parentId: entity.id,
      direction,
      amount: Number(amount),
      dueDate: dueDate || '',
      paidDate: paidDate || '',
      paidThrough: paidThrough || '',
      referenceNumber: referenceNumber || '',
      bankName: bankName || '',
      paidBy: paidBy || '',
      status: '',
      notes: notes || '',
    });
    res.status(201).json(payment);
  });

  router.put('/payments/:paymentId', (req, res) => {
    const row = db.get(paymentsCollection, req.params.paymentId);
    if (!row) return res.status(404).json({ error: 'Payment not found.' });
    const patch = {};
    for (const f of ['direction', 'amount', 'dueDate', 'paidDate', 'paidThrough', 'referenceNumber', 'bankName', 'paidBy', 'status', 'notes']) {
      if (req.body[f] !== undefined) patch[f] = f === 'amount' ? Number(req.body[f]) || 0 : req.body[f];
    }
    res.json(db.update(paymentsCollection, req.params.paymentId, patch));
  });

  router.delete('/payments/:paymentId', (req, res) => {
    db.remove(paymentsCollection, req.params.paymentId);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createAssetRouter, computeAssetStats };
