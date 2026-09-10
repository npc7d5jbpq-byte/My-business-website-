// Brokers earn a commission on deals they bring in (a colony plot sale, a
// land/shop/commercial sale, etc.) - tracked separately from the deal
// itself since the same broker works across many deals over time, and the
// office needs one place to see what's owed to *them* specifically.
//
// Shape: a broker has any number of deals, each deal has its own commission
// amount and its own payment schedule (the commission is very often paid to
// the broker in installments too, e.g. part now / part after a few days /
// the rest later) - same three-level nesting as colonies -> plots ->
// payments, just for commissions instead of sale proceeds.
//
// Brokers can also be given an "advance" - cash handed to them on credit,
// before any specific deal exists to justify it. When a real deal comes in
// later, some or all of its commission can be settled by drawing down that
// advance instead of a fresh cash payment (source: 'advance' on the
// commission payment, instead of the usual 'cash'/'pay_order'/'cheque').
// The advance itself is real money that already left the business the
// moment it was given, so it's counted as cash out right away; drawing on
// it later to settle a deal is just bookkeeping, not a second cash outflow
// - see src/routes/dashboard.js's collectMoneyFlows() for where that split
// is actually enforced.

const express = require('express');
const db = require('../db');
const { sumAmount, settledRows, pendingRows, round2 } = require('../finance');

const router = express.Router();

function computeDealStats(deal, payments) {
  const commissionAmount = Number(deal.commissionAmount) || 0;
  const totalPaid = round2(sumAmount(settledRows(payments)));
  const totalPending = round2(sumAmount(pendingRows(payments)));
  const remaining = round2(commissionAmount - totalPaid);
  return { commissionAmount, totalPaid, totalPending, remaining };
}

function computeBrokerStats(broker) {
  const deals = db.list('brokerDeals', (d) => d.brokerId === broker.id);
  let totalCommission = 0;
  let totalPaid = 0;
  let totalPending = 0;
  let cashCommissionPaid = 0;
  let advanceUsed = 0;
  for (const deal of deals) {
    const cancelled = deal.status === 'cancelled';
    const payments = db.list('brokerCommissionPayments', (p) => p.parentId === deal.id);
    const stats = computeDealStats(deal, payments);
    // A cancelled deal's commission is void - it no longer counts as a
    // committed liability (totalCommission) or as still owed (totalPending).
    // Whatever was *already* paid on it before cancellation is real cash
    // that already left the business, though, so that stays counted below
    // exactly like any other settled payment - cancelling doesn't undo it.
    if (!cancelled) {
      totalCommission += stats.commissionAmount;
      totalPending += stats.remaining;
    }
    totalPaid += stats.totalPaid;
    for (const p of settledRows(payments)) {
      if (p.source === 'advance') advanceUsed += Number(p.amount) || 0;
      else cashCommissionPaid += Number(p.amount) || 0;
    }
  }
  const advances = db.list('brokerAdvances', (a) => a.brokerId === broker.id);
  const totalAdvanceGiven = round2(sumAmount(advances));
  const advanceBalance = round2(totalAdvanceGiven - advanceUsed);
  return {
    dealsCount: deals.length,
    totalCommission: round2(totalCommission),
    totalPaid: round2(totalPaid),
    totalPending: round2(totalPending),
    cashCommissionPaid: round2(cashCommissionPaid),
    totalAdvanceGiven,
    advanceUsed: round2(advanceUsed),
    advanceBalance,
    // Real cash that left the business through this broker: commission
    // actually paid in cash/cheque/pay order, plus every advance given -
    // advance *offsets* against a deal are deliberately excluded (no new
    // cash moved then, see the file header note above).
    cashOut: round2(cashCommissionPaid + totalAdvanceGiven),
  };
}

router.get('/brokers', (req, res) => {
  const brokers = db.list('brokers').map((b) => Object.assign({}, b, { stats: computeBrokerStats(b) }));
  brokers.sort((a, b) => a.name.localeCompare(b.name));
  res.json(brokers);
});

router.post('/brokers', (req, res) => {
  const { name, phone, cnic, notes } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Broker name is required.' });
  const broker = db.insert('brokers', {
    name: String(name).trim(),
    phone: phone || '',
    cnic: cnic || '',
    notes: notes || '',
  });
  res.status(201).json(broker);
});

router.get('/brokers/:id', (req, res) => {
  const broker = db.get('brokers', req.params.id);
  if (!broker) return res.status(404).json({ error: 'Broker not found.' });

  const deals = db
    .list('brokerDeals', (d) => d.brokerId === broker.id)
    .map((d) => {
      const payments = db.list('brokerCommissionPayments', (p) => p.parentId === d.id);
      return Object.assign({}, d, { payments, stats: computeDealStats(d, payments) });
    })
    .sort((a, b) => new Date(b.dealDate || b.createdAt || 0) - new Date(a.dealDate || a.createdAt || 0));

  const advances = db
    .list('brokerAdvances', (a) => a.brokerId === broker.id)
    .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));

  res.json({ ...broker, stats: computeBrokerStats(broker), deals, advances });
});

router.put('/brokers/:id', (req, res) => {
  const broker = db.get('brokers', req.params.id);
  if (!broker) return res.status(404).json({ error: 'Broker not found.' });
  const { name, phone, cnic, notes } = req.body;
  const patch = {};
  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ error: 'Broker name is required.' });
    patch.name = String(name).trim();
  }
  if (phone !== undefined) patch.phone = phone;
  if (cnic !== undefined) patch.cnic = cnic;
  if (notes !== undefined) patch.notes = notes;
  res.json(db.update('brokers', req.params.id, patch));
});

router.delete('/brokers/:id', (req, res) => {
  const broker = db.get('brokers', req.params.id);
  if (!broker) return res.status(404).json({ error: 'Broker not found.' });
  const dealIds = db.list('brokerDeals', (d) => d.brokerId === broker.id).map((d) => d.id);
  db.removeWhere('brokerCommissionPayments', (p) => dealIds.includes(p.parentId));
  db.removeWhere('brokerDeals', (d) => d.brokerId === broker.id);
  db.removeWhere('brokerAdvances', (a) => a.brokerId === broker.id);
  db.remove('brokers', broker.id);
  res.json({ ok: true });
});

// ---- Advances (credit given to a broker ahead of any specific deal) ----

router.post('/brokers/:id/advances', (req, res) => {
  const broker = db.get('brokers', req.params.id);
  if (!broker) return res.status(404).json({ error: 'Broker not found.' });
  const { amount, date, paidThrough, referenceNumber, bankName, paidBy, notes } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'A positive amount is required.' });
  const advance = db.insert('brokerAdvances', {
    brokerId: broker.id,
    amount: Number(amount),
    date: date || '',
    paidThrough: paidThrough || '',
    referenceNumber: referenceNumber || '',
    bankName: bankName || '',
    paidBy: paidBy || '',
    notes: notes || '',
  });
  res.status(201).json(advance);
});

router.delete('/broker-advances/:id', (req, res) => {
  db.remove('brokerAdvances', req.params.id);
  res.json({ ok: true });
});

// ---- Deals ----

router.post('/brokers/:id/deals', (req, res) => {
  const broker = db.get('brokers', req.params.id);
  if (!broker) return res.status(404).json({ error: 'Broker not found.' });
  const { description, dealValue, commissionPercent, commissionAmount, dealDate, notes } = req.body;
  if (!description || !String(description).trim()) return res.status(400).json({ error: 'A description of the deal is required.' });
  if (!commissionAmount || Number(commissionAmount) <= 0) return res.status(400).json({ error: 'A positive commission amount is required.' });
  const deal = db.insert('brokerDeals', {
    brokerId: broker.id,
    description: String(description).trim(),
    dealValue: Number(dealValue) || 0,
    commissionPercent: Number(commissionPercent) || 0,
    commissionAmount: Number(commissionAmount),
    dealDate: dealDate || '',
    status: 'active',
    cancelReason: '',
    notes: notes || '',
  });
  res.status(201).json(deal);
});

router.put('/broker-deals/:id', (req, res) => {
  const deal = db.get('brokerDeals', req.params.id);
  if (!deal) return res.status(404).json({ error: 'Deal not found.' });
  const fields = ['description', 'dealValue', 'commissionPercent', 'commissionAmount', 'dealDate', 'status', 'cancelReason', 'notes'];
  const numeric = new Set(['dealValue', 'commissionPercent', 'commissionAmount']);
  const patch = {};
  for (const f of fields) {
    if (req.body[f] !== undefined) patch[f] = numeric.has(f) ? Number(req.body[f]) || 0 : req.body[f];
  }
  res.json(db.update('brokerDeals', req.params.id, patch));
});

router.delete('/broker-deals/:id', (req, res) => {
  const deal = db.get('brokerDeals', req.params.id);
  if (!deal) return res.status(404).json({ error: 'Deal not found.' });
  db.removeWhere('brokerCommissionPayments', (p) => p.parentId === deal.id);
  db.remove('brokerDeals', deal.id);
  res.json({ ok: true });
});

// ---- Commission payments ----

function findBrokerForDeal(deal) {
  return db.get('brokers', deal.brokerId);
}

router.post('/broker-deals/:id/payments', (req, res) => {
  const deal = db.get('brokerDeals', req.params.id);
  if (!deal) return res.status(404).json({ error: 'Deal not found.' });
  const { amount, dueDate, paidDate, source, paidThrough, referenceNumber, bankName, paidBy, notes } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'A positive amount is required.' });

  const useAdvance = source === 'advance';
  if (useAdvance) {
    const broker = findBrokerForDeal(deal);
    const available = broker ? computeBrokerStats(broker).advanceBalance : 0;
    if (Number(amount) > available) {
      return res.status(400).json({ error: `Not enough advance balance available (Rs. ${available} left).` });
    }
  }

  const payment = db.insert('brokerCommissionPayments', {
    parentId: deal.id,
    amount: Number(amount),
    dueDate: dueDate || '',
    // An advance offset is a completed book transfer the moment it's
    // recorded - always treat it as settled today unless a date was given.
    paidDate: useAdvance ? (paidDate || new Date().toISOString().slice(0, 10)) : (paidDate || ''),
    source: useAdvance ? 'advance' : 'cash',
    paidThrough: useAdvance ? '' : (paidThrough || ''),
    referenceNumber: useAdvance ? '' : (referenceNumber || ''),
    bankName: useAdvance ? '' : (bankName || ''),
    paidBy: paidBy || '',
    status: '',
    notes: notes || '',
  });
  res.status(201).json(payment);
});

router.put('/broker-payments/:id', (req, res) => {
  const row = db.get('brokerCommissionPayments', req.params.id);
  if (!row) return res.status(404).json({ error: 'Payment not found.' });
  const patch = {};
  for (const f of ['amount', 'dueDate', 'paidDate', 'source', 'paidThrough', 'referenceNumber', 'bankName', 'paidBy', 'status', 'notes']) {
    if (req.body[f] !== undefined) patch[f] = f === 'amount' ? Number(req.body[f]) || 0 : req.body[f];
  }
  res.json(db.update('brokerCommissionPayments', req.params.id, patch));
});

router.delete('/broker-payments/:id', (req, res) => {
  db.remove('brokerCommissionPayments', req.params.id);
  res.json({ ok: true });
});

module.exports = { router, computeBrokerStats };
