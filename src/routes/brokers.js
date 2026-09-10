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
  for (const deal of deals) {
    const payments = db.list('brokerCommissionPayments', (p) => p.parentId === deal.id);
    const stats = computeDealStats(deal, payments);
    totalCommission += stats.commissionAmount;
    totalPaid += stats.totalPaid;
    totalPending += stats.remaining;
  }
  return {
    dealsCount: deals.length,
    totalCommission: round2(totalCommission),
    totalPaid: round2(totalPaid),
    totalPending: round2(totalPending),
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

  res.json({ ...broker, stats: computeBrokerStats(broker), deals });
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
  db.remove('brokers', broker.id);
  res.json({ ok: true });
});

// ---- Deals ----

router.post('/brokers/:id/deals', (req, res) => {
  const broker = db.get('brokers', req.params.id);
  if (!broker) return res.status(404).json({ error: 'Broker not found.' });
  const { description, dealValue, commissionAmount, dealDate, notes } = req.body;
  if (!description || !String(description).trim()) return res.status(400).json({ error: 'A description of the deal is required.' });
  if (!commissionAmount || Number(commissionAmount) <= 0) return res.status(400).json({ error: 'A positive commission amount is required.' });
  const deal = db.insert('brokerDeals', {
    brokerId: broker.id,
    description: String(description).trim(),
    dealValue: Number(dealValue) || 0,
    commissionAmount: Number(commissionAmount),
    dealDate: dealDate || '',
    notes: notes || '',
  });
  res.status(201).json(deal);
});

router.put('/broker-deals/:id', (req, res) => {
  const deal = db.get('brokerDeals', req.params.id);
  if (!deal) return res.status(404).json({ error: 'Deal not found.' });
  const fields = ['description', 'dealValue', 'commissionAmount', 'dealDate', 'notes'];
  const numeric = new Set(['dealValue', 'commissionAmount']);
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

router.post('/broker-deals/:id/payments', (req, res) => {
  const deal = db.get('brokerDeals', req.params.id);
  if (!deal) return res.status(404).json({ error: 'Deal not found.' });
  const { amount, dueDate, paidDate, notes } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'A positive amount is required.' });
  const payment = db.insert('brokerCommissionPayments', {
    parentId: deal.id,
    amount: Number(amount),
    dueDate: dueDate || '',
    paidDate: paidDate || '',
    notes: notes || '',
  });
  res.status(201).json(payment);
});

router.put('/broker-payments/:id', (req, res) => {
  const row = db.get('brokerCommissionPayments', req.params.id);
  if (!row) return res.status(404).json({ error: 'Payment not found.' });
  const patch = {};
  for (const f of ['amount', 'dueDate', 'paidDate', 'notes']) {
    if (req.body[f] !== undefined) patch[f] = f === 'amount' ? Number(req.body[f]) || 0 : req.body[f];
  }
  res.json(db.update('brokerCommissionPayments', req.params.id, patch));
});

router.delete('/broker-payments/:id', (req, res) => {
  db.remove('brokerCommissionPayments', req.params.id);
  res.json({ ok: true });
});

module.exports = { router, computeBrokerStats };
