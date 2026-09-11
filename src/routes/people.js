// A general-purpose way to track a business relationship with someone who
// doesn't fit into any of the other modules - a colony, a piece of land, a
// shop, or a broker relationship. Same three-level shape as everywhere
// else in the app (a person -> any number of deals -> each deal's own
// payment schedule), modelled closely on Brokers Commission's own
// list-page + dedicated-page pattern, but with no commission concept:
// a deal here is just money owed one way or the other - "receivable"
// (they owe the office) or "payable" (the office owes them) - settled
// over one or more payments exactly like a colony plot or an
// agricultural/shop/commercial sale.
//
// This is deliberately a separate concept from the Unified Person View
// (src/routes/directory.js's GET /person, matched by name across every
// OTHER module) - that view still exists for the cross-module case, and
// in fact folds in a matching Person's deals from here too, so someone
// who is both a colony buyer and has a manual deal recorded here shows up
// completely in either place.

const express = require('express');
const db = require('../db');
const { sumAmount, settledRows, pendingRows, round2 } = require('../finance');
const { removeAttachmentsFor } = require('./attachments');

const router = express.Router();

function computeDealStats(deal, payments) {
  const amount = Number(deal.amount) || 0;
  const totalPaid = round2(sumAmount(settledRows(payments)));
  const totalPending = round2(sumAmount(pendingRows(payments)));
  const remaining = round2(amount - totalPaid);
  return { amount, totalPaid, totalPending, remaining };
}

function computePersonStats(person) {
  const deals = db.list('peopleDeals', (d) => d.personId === person.id);
  let totalReceivable = 0;
  let totalPayable = 0;
  let totalReceived = 0;
  let totalPaidOut = 0;
  for (const deal of deals) {
    const cancelled = deal.status === 'cancelled';
    const payments = db.list('peoplePayments', (p) => p.parentId === deal.id);
    const stats = computeDealStats(deal, payments);
    // Same convention as every other cancel-vs-delete pair in the app: a
    // cancelled deal's remaining balance stops counting as owed either
    // way, but whatever was already settled on it before cancellation
    // stays real and counted.
    if (deal.direction === 'payable') {
      if (!cancelled) totalPayable += stats.remaining;
      totalPaidOut += stats.totalPaid;
    } else {
      if (!cancelled) totalReceivable += stats.remaining;
      totalReceived += stats.totalPaid;
    }
  }
  return {
    dealsCount: deals.length,
    totalReceivable: round2(totalReceivable),
    totalPayable: round2(totalPayable),
    totalReceived: round2(totalReceived),
    totalPaid: round2(totalPaidOut),
  };
}

router.get('/people', (req, res) => {
  const people = db.list('people').map((p) => Object.assign({}, p, { stats: computePersonStats(p) }));
  people.sort((a, b) => a.name.localeCompare(b.name));
  res.json(people);
});

router.post('/people', (req, res) => {
  const { name, phone, cnic, notes } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required.' });
  const person = db.insert('people', {
    name: String(name).trim(),
    phone: phone || '',
    cnic: cnic || '',
    notes: notes || '',
  });
  res.status(201).json(person);
});

router.get('/people/:id', (req, res) => {
  const person = db.get('people', req.params.id);
  if (!person) return res.status(404).json({ error: 'Person not found.' });

  const deals = db
    .list('peopleDeals', (d) => d.personId === person.id)
    .map((d) => {
      const payments = db.list('peoplePayments', (p) => p.parentId === d.id);
      return Object.assign({}, d, { payments, stats: computeDealStats(d, payments) });
    })
    .sort((a, b) => new Date(b.dealDate || b.createdAt || 0) - new Date(a.dealDate || a.createdAt || 0));

  res.json({ ...person, stats: computePersonStats(person), deals });
});

router.put('/people/:id', (req, res) => {
  const person = db.get('people', req.params.id);
  if (!person) return res.status(404).json({ error: 'Person not found.' });
  const { name, phone, cnic, notes } = req.body;
  const patch = {};
  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ error: 'Name is required.' });
    patch.name = String(name).trim();
  }
  if (phone !== undefined) patch.phone = phone;
  if (cnic !== undefined) patch.cnic = cnic;
  if (notes !== undefined) patch.notes = notes;
  res.json(db.update('people', req.params.id, patch));
});

router.delete('/people/:id', (req, res) => {
  const person = db.get('people', req.params.id);
  if (!person) return res.status(404).json({ error: 'Person not found.' });
  const dealIds = db.list('peopleDeals', (d) => d.personId === person.id).map((d) => d.id);
  db.removeWhere('peoplePayments', (p) => dealIds.includes(p.parentId));
  db.removeWhere('peopleDeals', (d) => d.personId === person.id);
  removeAttachmentsFor('person', person.id);
  db.remove('people', person.id);
  res.json({ ok: true });
});

// ---- Deals ----

router.post('/people/:id/deals', (req, res) => {
  const person = db.get('people', req.params.id);
  if (!person) return res.status(404).json({ error: 'Person not found.' });
  const { description, direction, amount, dealDate, notes } = req.body;
  if (!description || !String(description).trim()) return res.status(400).json({ error: 'A description of the deal is required.' });
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'A positive amount is required.' });
  if (direction !== 'receivable' && direction !== 'payable') {
    return res.status(400).json({ error: "direction must be 'receivable' or 'payable'." });
  }
  const deal = db.insert('peopleDeals', {
    personId: person.id,
    description: String(description).trim(),
    direction,
    amount: Number(amount),
    dealDate: dealDate || '',
    status: 'active',
    cancelReason: '',
    notes: notes || '',
  });
  res.status(201).json(deal);
});

router.put('/person-deals/:id', (req, res) => {
  const deal = db.get('peopleDeals', req.params.id);
  if (!deal) return res.status(404).json({ error: 'Deal not found.' });
  const fields = ['description', 'direction', 'amount', 'dealDate', 'status', 'cancelReason', 'notes'];
  const numeric = new Set(['amount']);
  const patch = {};
  for (const f of fields) {
    if (req.body[f] !== undefined) patch[f] = numeric.has(f) ? Number(req.body[f]) || 0 : req.body[f];
  }
  res.json(db.update('peopleDeals', req.params.id, patch));
});

router.delete('/person-deals/:id', (req, res) => {
  const deal = db.get('peopleDeals', req.params.id);
  if (!deal) return res.status(404).json({ error: 'Deal not found.' });
  db.removeWhere('peoplePayments', (p) => p.parentId === deal.id);
  db.remove('peopleDeals', deal.id);
  res.json({ ok: true });
});

// ---- Payments ----

router.post('/person-deals/:id/payments', (req, res) => {
  const deal = db.get('peopleDeals', req.params.id);
  if (!deal) return res.status(404).json({ error: 'Deal not found.' });
  const { amount, dueDate, paidDate, paidThrough, referenceNumber, bankName, paidBy, notes } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'A positive amount is required.' });
  const payment = db.insert('peoplePayments', {
    parentId: deal.id,
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

router.put('/person-payments/:id', (req, res) => {
  const row = db.get('peoplePayments', req.params.id);
  if (!row) return res.status(404).json({ error: 'Payment not found.' });
  const patch = {};
  for (const f of ['amount', 'dueDate', 'paidDate', 'paidThrough', 'referenceNumber', 'bankName', 'paidBy', 'status', 'notes']) {
    if (req.body[f] !== undefined) patch[f] = f === 'amount' ? Number(req.body[f]) || 0 : req.body[f];
  }
  res.json(db.update('peoplePayments', req.params.id, patch));
});

router.delete('/person-payments/:id', (req, res) => {
  db.remove('peoplePayments', req.params.id);
  res.json({ ok: true });
});

module.exports = { router, computePersonStats, computeDealStats };
