const express = require('express');
const db = require('../db');
const { sumAmount, settledRows, pendingRows, isOverdue, round2 } = require('../finance');
const { computeColonyStats } = require('./colonies');
const { computeAssetStats } = require('./assetModule');

const router = express.Router();

const ASSET_MODULES = [
  { key: 'agriculturalLands', payments: 'agriculturalPayments', label: 'Agricultural Land' },
  { key: 'shops', payments: 'shopPayments', label: 'Shops' },
  { key: 'commercialLands', payments: 'commercialPayments', label: 'Commercial Land & Plots' },
];

function assetModuleTotals(mod) {
  const entities = db.list(mod.key);
  let totalPaid = 0;
  let totalReceived = 0;
  let totalPayable = 0;
  let totalReceivable = 0;
  let profit = 0;
  for (const entity of entities) {
    const payments = db.list(mod.payments, (p) => p.parentId === entity.id);
    const stats = computeAssetStats(entity, payments);
    totalPaid += stats.totalPaid;
    totalReceived += stats.totalReceived;
    totalPayable += stats.totalPayable;
    totalReceivable += stats.totalReceivable;
    profit += stats.profit;
  }
  return {
    label: mod.label,
    count: entities.length,
    totalPaid: round2(totalPaid),
    totalReceived: round2(totalReceived),
    totalPayable: round2(totalPayable),
    totalReceivable: round2(totalReceivable),
    profit: round2(profit),
  };
}

function colonyModuleTotals() {
  const colonies = db.list('colonies');
  let totalReceived = 0;
  let totalReceivable = 0;
  let totalExpensesPaid = 0;
  let totalExpensesPending = 0;
  let acquisitionCost = 0;
  let projectedProfit = 0;
  let cashProfit = 0;
  let totalPlots = 0;
  let soldPlots = 0;
  for (const colony of colonies) {
    const stats = computeColonyStats(colony);
    totalReceived += stats.totalReceived;
    totalReceivable += stats.totalReceivable;
    totalExpensesPaid += stats.totalExpensesPaid;
    totalExpensesPending += stats.totalExpensesPending;
    acquisitionCost += stats.acquisitionCost;
    projectedProfit += stats.projectedProfit;
    cashProfit += stats.cashProfit;
    totalPlots += stats.totalPlots;
    soldPlots += stats.sold;
  }
  return {
    label: 'Commercial Colonies',
    count: colonies.length,
    totalPlots,
    soldPlots,
    totalReceived: round2(totalReceived),
    totalReceivable: round2(totalReceivable),
    totalExpensesPaid: round2(totalExpensesPaid),
    totalExpensesPending: round2(totalExpensesPending),
    acquisitionCost: round2(acquisitionCost),
    projectedProfit: round2(projectedProfit),
    cashProfit: round2(cashProfit),
  };
}

router.get('/dashboard', (req, res) => {
  const colonySummary = colonyModuleTotals();
  const assetSummaries = ASSET_MODULES.map(assetModuleTotals);

  const totalMoneyIn = round2(
    colonySummary.totalReceived + assetSummaries.reduce((s, m) => s + m.totalReceived, 0)
  );
  const totalMoneyOut = round2(
    colonySummary.totalExpensesPaid +
      colonySummary.acquisitionCost +
      assetSummaries.reduce((s, m) => s + m.totalPaid, 0)
  );
  const totalReceivable = round2(
    colonySummary.totalReceivable + assetSummaries.reduce((s, m) => s + m.totalReceivable, 0)
  );
  const totalPayable = round2(
    colonySummary.totalExpensesPending + assetSummaries.reduce((s, m) => s + m.totalPayable, 0)
  );
  const netProfit = round2(
    colonySummary.cashProfit + assetSummaries.reduce((s, m) => s + m.profit, 0)
  );

  res.json({
    totals: { totalMoneyIn, totalMoneyOut, totalReceivable, totalPayable, netProfit },
    colonySummary,
    assetSummaries,
  });
});

// Every dueDate that hasn't been settled yet, across every module, sorted
// soonest first, with an `overdue` flag for anything already past.
router.get('/dashboard/upcoming', (req, res) => {
  const items = [];

  for (const colony of db.list('colonies')) {
    const plots = db.list('plots', (p) => p.colonyId === colony.id);
    const plotIds = new Set(plots.map((p) => p.id));
    const plotById = new Map(plots.map((p) => [p.id, p]));
    for (const row of pendingRows(db.list('plotPayments', (p) => plotIds.has(p.parentId)))) {
      const plot = plotById.get(row.parentId);
      items.push({
        module: 'Colony',
        context: `${colony.name} - Plot ${plot ? plot.plotNumber : ''}`,
        person: plot ? plot.buyerName : '',
        amount: row.amount,
        dueDate: row.dueDate,
        direction: 'received',
        overdue: isOverdue(row),
        notes: row.notes,
      });
    }
    for (const row of pendingRows(db.list('colonyMilestones', (m) => m.colonyId === colony.id && m.status !== 'completed').map((m) => ({ amount: 0, dueDate: m.dueDate, paidDate: '', notes: m.title })))) {
      items.push({
        module: 'Colony',
        context: `${colony.name} - Development task`,
        person: '',
        amount: 0,
        dueDate: row.dueDate,
        direction: 'task',
        overdue: isOverdue(row),
        notes: row.notes,
      });
    }
    for (const row of pendingRows(db.list('colonyExpenses', (e) => e.colonyId === colony.id))) {
      items.push({
        module: 'Colony',
        context: `${colony.name} - Expense`,
        person: '',
        amount: row.amount,
        dueDate: row.dueDate,
        direction: 'paid',
        overdue: isOverdue(row),
        notes: row.notes || row.title,
      });
    }
  }

  for (const mod of ASSET_MODULES) {
    const entities = db.list(mod.key);
    const entityById = new Map(entities.map((e) => [e.id, e]));
    for (const row of pendingRows(db.list(mod.payments))) {
      const entity = entityById.get(row.parentId);
      if (!entity) continue;
      items.push({
        module: mod.label,
        context: entity.title,
        person: row.direction === 'paid' ? entity.sellerName : entity.buyerName,
        amount: row.amount,
        dueDate: row.dueDate,
        direction: row.direction,
        overdue: isOverdue(row),
        notes: row.notes,
      });
    }
  }

  items.sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
  res.json(items);
});

// Money in / out / profit grouped by calendar year, across every module.
router.get('/dashboard/yearly', (req, res) => {
  const years = {};
  function bucket(year) {
    if (!years[year]) years[year] = { year, moneyIn: 0, moneyOut: 0 };
    return years[year];
  }
  function yearOf(dateStr) {
    if (!dateStr) return null;
    const y = new Date(dateStr).getFullYear();
    return Number.isFinite(y) ? y : null;
  }

  for (const row of settledRows(db.list('plotPayments'))) {
    const y = yearOf(row.paidDate);
    if (y) bucket(y).moneyIn += Number(row.amount) || 0;
  }
  for (const row of settledRows(db.list('colonyExpenses'))) {
    const y = yearOf(row.paidDate);
    if (y) bucket(y).moneyOut += Number(row.amount) || 0;
  }
  for (const mod of ASSET_MODULES) {
    for (const row of settledRows(db.list(mod.payments))) {
      const y = yearOf(row.paidDate);
      if (!y) continue;
      if (row.direction === 'received') bucket(y).moneyIn += Number(row.amount) || 0;
      else bucket(y).moneyOut += Number(row.amount) || 0;
    }
  }

  const result = Object.values(years)
    .map((b) => ({ year: b.year, moneyIn: round2(b.moneyIn), moneyOut: round2(b.moneyOut), net: round2(b.moneyIn - b.moneyOut) }))
    .sort((a, b) => a.year - b.year);
  res.json(result);
});

// Every settled (actually happened) transaction across every module, for
// the full ledger / year-end review.
router.get('/dashboard/ledger', (req, res) => {
  const entries = [];

  for (const colony of db.list('colonies')) {
    const plots = db.list('plots', (p) => p.colonyId === colony.id);
    const plotById = new Map(plots.map((p) => [p.id, p]));
    for (const row of settledRows(db.list('plotPayments', (p) => plotById.has(p.parentId)))) {
      const plot = plotById.get(row.parentId);
      entries.push({
        date: row.paidDate,
        module: 'Colony',
        context: `${colony.name} - Plot ${plot ? plot.plotNumber : ''}`,
        direction: 'in',
        amount: row.amount,
        notes: row.notes,
      });
    }
    for (const row of settledRows(db.list('colonyExpenses', (e) => e.colonyId === colony.id))) {
      entries.push({
        date: row.paidDate,
        module: 'Colony',
        context: `${colony.name} - ${row.title}`,
        direction: 'out',
        amount: row.amount,
        notes: row.notes,
      });
    }
    if (colony.acquisitionCost) {
      entries.push({
        date: colony.createdAt,
        module: 'Colony',
        context: `${colony.name} - Land acquisition / development cost`,
        direction: 'out',
        amount: colony.acquisitionCost,
        notes: '',
      });
    }
  }

  for (const mod of ASSET_MODULES) {
    const entityById = new Map(db.list(mod.key).map((e) => [e.id, e]));
    for (const row of settledRows(db.list(mod.payments))) {
      const entity = entityById.get(row.parentId);
      if (!entity) continue;
      entries.push({
        date: row.paidDate,
        module: mod.label,
        context: entity.title,
        direction: row.direction === 'received' ? 'in' : 'out',
        amount: row.amount,
        notes: row.notes,
      });
    }
  }

  entries.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  res.json(entries);
});

module.exports = router;
