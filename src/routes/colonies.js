const express = require('express');
const db = require('../db');
const { sumAmount, settledRows, pendingRows, round2 } = require('../finance');

const router = express.Router();

function computeColonyStats(colony) {
  const plots = db.list('plots', (p) => p.colonyId === colony.id);
  const totalPlots = plots.length;
  const sold = plots.filter((p) => p.status === 'sold').length;
  const reserved = plots.filter((p) => p.status === 'reserved').length;
  const available = plots.filter((p) => p.status === 'available').length;
  const percentSold = totalPlots ? round2((sold / totalPlots) * 100) : 0;
  const percentBooked = totalPlots ? round2(((sold + reserved) / totalPlots) * 100) : 0;

  // Only plots that actually have a live buyer commitment contribute to
  // sale value / dues - a cancelled sale (status: 'cancelled') is excluded
  // here the same way a cancelled broker deal is excluded from commission
  // totals, even though any money already received on it (below) stays
  // counted as real cash that came in.
  const bookedPlots = plots.filter((p) => p.status === 'sold' || p.status === 'reserved');
  const totalSaleValue = round2(bookedPlots.reduce((sum, p) => sum + (Number(p.price) || 0), 0));

  const plotIds = new Set(plots.map((p) => p.id));
  const payments = db.list('plotPayments', (pay) => plotIds.has(pay.parentId));
  const totalReceived = round2(sumAmount(settledRows(payments)));
  // Computed per-plot (not as one global totalSaleValue - totalReceived
  // subtraction) so a cancelled plot that already received a partial
  // payment can't drag every *other* plot's receivable down - its own
  // contribution here is simply 0, not negative.
  const receivedByPlot = new Map();
  for (const row of settledRows(payments)) {
    receivedByPlot.set(row.parentId, (receivedByPlot.get(row.parentId) || 0) + (Number(row.amount) || 0));
  }
  const totalReceivable = round2(
    bookedPlots.reduce((sum, p) => sum + Math.max(0, (Number(p.price) || 0) - (receivedByPlot.get(p.id) || 0)), 0)
  );

  const expenses = db.list('colonyExpenses', (e) => e.colonyId === colony.id);
  const totalExpensesPaid = round2(sumAmount(settledRows(expenses)));
  const totalExpensesPending = round2(sumAmount(pendingRows(expenses)));

  const acquisitionCost = Number(colony.acquisitionCost) || 0;
  const projectedProfit = round2(totalSaleValue - acquisitionCost - totalExpensesPaid - totalExpensesPending);
  const cashProfit = round2(totalReceived - acquisitionCost - totalExpensesPaid);

  const milestones = db.list('colonyMilestones', (m) => m.colonyId === colony.id);
  const pendingMilestones = milestones.filter((m) => m.status !== 'completed').length;

  return {
    totalPlots,
    sold,
    reserved,
    available,
    percentSold,
    percentBooked,
    totalSaleValue,
    totalReceived,
    totalReceivable,
    acquisitionCost,
    totalExpensesPaid,
    totalExpensesPending,
    projectedProfit,
    cashProfit,
    totalMilestones: milestones.length,
    pendingMilestones,
  };
}

router.get('/colonies', (req, res) => {
  const colonies = db.list('colonies').map((c) => Object.assign({}, c, { stats: computeColonyStats(c) }));
  colonies.sort((a, b) => a.name.localeCompare(b.name));
  res.json(colonies);
});

router.post('/colonies', (req, res) => {
  const { name, location, acquisitionCost, description } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Colony name is required.' });
  const colony = db.insert('colonies', {
    name: String(name).trim(),
    location: location || '',
    acquisitionCost: Number(acquisitionCost) || 0,
    description: description || '',
  });
  res.status(201).json(colony);
});

router.get('/colonies/:id', (req, res) => {
  const colony = db.get('colonies', req.params.id);
  if (!colony) return res.status(404).json({ error: 'Colony not found.' });

  const plots = db
    .list('plots', (p) => p.colonyId === colony.id)
    .map((p) => {
      const payments = db.list('plotPayments', (pay) => pay.parentId === p.id);
      const received = round2(sumAmount(settledRows(payments)));
      const remaining = round2((Number(p.price) || 0) - received);
      return Object.assign({}, p, { payments, received, remaining });
    })
    .sort((a, b) => a.plotNumber.localeCompare(b.plotNumber, undefined, { numeric: true }));

  const milestones = db
    .list('colonyMilestones', (m) => m.colonyId === colony.id)
    .sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));

  const expenses = db
    .list('colonyExpenses', (e) => e.colonyId === colony.id)
    .sort((a, b) => new Date(b.dueDate || b.paidDate || 0) - new Date(a.dueDate || a.paidDate || 0));

  res.json({
    ...colony,
    stats: computeColonyStats(colony),
    plots,
    milestones,
    expenses,
  });
});

router.put('/colonies/:id', (req, res) => {
  const colony = db.get('colonies', req.params.id);
  if (!colony) return res.status(404).json({ error: 'Colony not found.' });
  const { name, location, acquisitionCost, description } = req.body;
  const patch = {};
  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ error: 'Colony name is required.' });
    patch.name = String(name).trim();
  }
  if (location !== undefined) patch.location = location;
  if (acquisitionCost !== undefined) patch.acquisitionCost = Number(acquisitionCost) || 0;
  if (description !== undefined) patch.description = description;
  res.json(db.update('colonies', req.params.id, patch));
});

router.delete('/colonies/:id', (req, res) => {
  const colony = db.get('colonies', req.params.id);
  if (!colony) return res.status(404).json({ error: 'Colony not found.' });
  const plotIds = db.list('plots', (p) => p.colonyId === colony.id).map((p) => p.id);
  db.removeWhere('plotPayments', (pay) => plotIds.includes(pay.parentId));
  db.removeWhere('plots', (p) => p.colonyId === colony.id);
  db.removeWhere('colonyMilestones', (m) => m.colonyId === colony.id);
  db.removeWhere('colonyExpenses', (e) => e.colonyId === colony.id);
  db.remove('colonies', colony.id);
  res.json({ ok: true });
});

// ---- Plots ----

router.post('/colonies/:id/plots', (req, res) => {
  const colony = db.get('colonies', req.params.id);
  if (!colony) return res.status(404).json({ error: 'Colony not found.' });
  const { plotNumber, size, category, frontFt, lengthFt, price, status, buyerName, buyerPhone, buyerCnic, saleDate, notes } = req.body;
  if (!plotNumber || !String(plotNumber).trim()) return res.status(400).json({ error: 'Plot number is required.' });
  const plot = db.insert('plots', {
    colonyId: colony.id,
    plotNumber: String(plotNumber).trim(),
    size: size || '',
    category: category || 'residential',
    frontFt: Number(frontFt) || 0,
    lengthFt: Number(lengthFt) || 0,
    price: Number(price) || 0,
    status: status || 'available',
    previousStatus: '',
    cancelReason: '',
    buyerName: buyerName || '',
    buyerPhone: buyerPhone || '',
    buyerCnic: buyerCnic || '',
    saleDate: saleDate || '',
    notes: notes || '',
  });
  res.status(201).json(plot);
});

router.put('/plots/:id', (req, res) => {
  const plot = db.get('plots', req.params.id);
  if (!plot) return res.status(404).json({ error: 'Plot not found.' });
  const fields = ['plotNumber', 'size', 'category', 'frontFt', 'lengthFt', 'price', 'status', 'previousStatus', 'cancelReason', 'buyerName', 'buyerPhone', 'buyerCnic', 'saleDate', 'notes'];
  const numeric = new Set(['price', 'frontFt', 'lengthFt']);
  const patch = {};
  for (const f of fields) {
    if (req.body[f] !== undefined) patch[f] = numeric.has(f) ? Number(req.body[f]) || 0 : req.body[f];
  }
  res.json(db.update('plots', req.params.id, patch));
});

router.delete('/plots/:id', (req, res) => {
  const plot = db.get('plots', req.params.id);
  if (!plot) return res.status(404).json({ error: 'Plot not found.' });
  db.removeWhere('plotPayments', (pay) => pay.parentId === plot.id);
  db.remove('plots', plot.id);
  res.json({ ok: true });
});

router.post('/plots/:id/payments', (req, res) => {
  const plot = db.get('plots', req.params.id);
  if (!plot) return res.status(404).json({ error: 'Plot not found.' });
  const { amount, dueDate, paidDate, paidThrough, referenceNumber, bankName, paidBy, notes } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'A positive amount is required.' });
  const payment = db.insert('plotPayments', {
    parentId: plot.id,
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

router.put('/plot-payments/:id', (req, res) => {
  const row = db.get('plotPayments', req.params.id);
  if (!row) return res.status(404).json({ error: 'Payment not found.' });
  const patch = {};
  for (const f of ['amount', 'dueDate', 'paidDate', 'paidThrough', 'referenceNumber', 'bankName', 'paidBy', 'status', 'notes']) {
    if (req.body[f] !== undefined) patch[f] = f === 'amount' ? Number(req.body[f]) || 0 : req.body[f];
  }
  res.json(db.update('plotPayments', req.params.id, patch));
});

router.delete('/plot-payments/:id', (req, res) => {
  db.remove('plotPayments', req.params.id);
  res.json({ ok: true });
});

// ---- Milestones (development tasks) ----

router.post('/colonies/:id/milestones', (req, res) => {
  const colony = db.get('colonies', req.params.id);
  if (!colony) return res.status(404).json({ error: 'Colony not found.' });
  const { title, dueDate, notes } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required.' });
  const milestone = db.insert('colonyMilestones', {
    colonyId: colony.id,
    title: String(title).trim(),
    dueDate: dueDate || '',
    status: 'pending',
    completedDate: '',
    notes: notes || '',
  });
  res.status(201).json(milestone);
});

router.put('/milestones/:id', (req, res) => {
  const row = db.get('colonyMilestones', req.params.id);
  if (!row) return res.status(404).json({ error: 'Milestone not found.' });
  const patch = {};
  for (const f of ['title', 'dueDate', 'status', 'completedDate', 'notes']) {
    if (req.body[f] !== undefined) patch[f] = req.body[f];
  }
  res.json(db.update('colonyMilestones', req.params.id, patch));
});

router.delete('/milestones/:id', (req, res) => {
  db.remove('colonyMilestones', req.params.id);
  res.json({ ok: true });
});

// ---- Development expenses ----

router.post('/colonies/:id/expenses', (req, res) => {
  const colony = db.get('colonies', req.params.id);
  if (!colony) return res.status(404).json({ error: 'Colony not found.' });
  const { title, category, amount, dueDate, paidDate, paidThrough, referenceNumber, bankName, paidBy, notes } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required.' });
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'A positive amount is required.' });
  const expense = db.insert('colonyExpenses', {
    colonyId: colony.id,
    title: String(title).trim(),
    category: category || 'development',
    amount: Number(amount),
    dueDate: dueDate || '',
    paidDate: paidDate || '',
    paidThrough: paidThrough || '',
    referenceNumber: referenceNumber || '',
    bankName: bankName || '',
    paidBy: paidBy || '',
    notes: notes || '',
  });
  res.status(201).json(expense);
});

router.put('/expenses/:id', (req, res) => {
  const row = db.get('colonyExpenses', req.params.id);
  if (!row) return res.status(404).json({ error: 'Expense not found.' });
  const patch = {};
  for (const f of ['title', 'category', 'amount', 'dueDate', 'paidDate', 'paidThrough', 'referenceNumber', 'bankName', 'paidBy', 'notes']) {
    if (req.body[f] !== undefined) patch[f] = f === 'amount' ? Number(req.body[f]) || 0 : req.body[f];
  }
  res.json(db.update('colonyExpenses', req.params.id, patch));
});

router.delete('/expenses/:id', (req, res) => {
  db.remove('colonyExpenses', req.params.id);
  res.json({ ok: true });
});

module.exports = { router, computeColonyStats };
