const express = require('express');
const db = require('../db');
const { sumAmount, settledRows, pendingRows, isOverdue, round2, startOfToday } = require('../finance');
const { computeColonyStats } = require('./colonies');
const { computeAssetStats } = require('./assetModule');
const { computeBrokerStats } = require('./brokers');

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

// Commissions owed to brokers are a real cost of doing the deal - committed
// the moment the deal is logged, whichever schedule it's actually paid on -
// so the full commission (not just what's been paid so far) counts against
// net profit, the same way an asset module's purchase price does.
function brokerModuleTotals() {
  const brokers = db.list('brokers');
  let totalCommission = 0;
  let totalPaid = 0;
  let totalPending = 0;
  let cashOut = 0;
  let totalAdvanceGiven = 0;
  let advanceBalance = 0;
  for (const broker of brokers) {
    const stats = computeBrokerStats(broker);
    totalCommission += stats.totalCommission;
    totalPaid += stats.totalPaid;
    totalPending += stats.totalPending;
    cashOut += stats.cashOut;
    totalAdvanceGiven += stats.totalAdvanceGiven;
    advanceBalance += stats.advanceBalance;
  }
  return {
    label: 'Brokers Commission',
    count: brokers.length,
    totalCommission: round2(totalCommission),
    totalPaid: round2(totalPaid),
    totalPending: round2(totalPending),
    // Real cash that left the business through brokers (commission paid in
    // cash/cheque/pay order, plus every advance given) - used for the
    // dashboard's cash-flow totals below. Deliberately NOT the same as
    // totalPaid, which also includes advance *offsets* (no new cash then).
    cashOut: round2(cashOut),
    totalAdvanceGiven: round2(totalAdvanceGiven),
    advanceBalance: round2(advanceBalance),
  };
}

router.get('/dashboard', (req, res) => {
  const colonySummary = colonyModuleTotals();
  const assetSummaries = ASSET_MODULES.map(assetModuleTotals);
  const brokerSummary = brokerModuleTotals();

  const totalMoneyIn = round2(
    colonySummary.totalReceived + assetSummaries.reduce((s, m) => s + m.totalReceived, 0)
  );
  const totalMoneyOut = round2(
    colonySummary.totalExpensesPaid +
      colonySummary.acquisitionCost +
      assetSummaries.reduce((s, m) => s + m.totalPaid, 0) +
      brokerSummary.cashOut
  );
  const totalReceivable = round2(
    colonySummary.totalReceivable + assetSummaries.reduce((s, m) => s + m.totalReceivable, 0)
  );
  const totalPayable = round2(
    colonySummary.totalExpensesPending +
      assetSummaries.reduce((s, m) => s + m.totalPayable, 0) +
      brokerSummary.totalPending
  );
  const netProfit = round2(
    colonySummary.cashProfit + assetSummaries.reduce((s, m) => s + m.profit, 0) - brokerSummary.totalCommission
  );

  res.json({
    totals: { totalMoneyIn, totalMoneyOut, totalReceivable, totalPayable, netProfit },
    colonySummary,
    assetSummaries,
    brokerSummary,
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

  for (const broker of db.list('brokers')) {
    const deals = db.list('brokerDeals', (d) => d.brokerId === broker.id);
    const dealById = new Map(deals.map((d) => [d.id, d]));
    const dealIds = new Set(deals.map((d) => d.id));
    for (const row of pendingRows(db.list('brokerCommissionPayments', (p) => dealIds.has(p.parentId)))) {
      const deal = dealById.get(row.parentId);
      items.push({
        module: 'Brokers Commission',
        context: `${broker.name} - ${deal ? deal.description : ''}`,
        person: broker.name,
        amount: row.amount,
        dueDate: row.dueDate,
        direction: 'paid',
        overdue: isOverdue(row),
        notes: row.notes,
      });
    }
  }

  items.sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
  res.json(items);
});

// Every settled money movement across every module, reduced to just
// { date, amount, direction ('in'|'out') } - the common shape the yearly
// and monthly summaries both bucket from, so adding a new module (like
// brokers) only means adding it here once.
function collectMoneyFlows() {
  const flows = [];
  for (const row of settledRows(db.list('plotPayments'))) {
    flows.push({ date: row.paidDate, amount: Number(row.amount) || 0, direction: 'in' });
  }
  for (const row of settledRows(db.list('colonyExpenses'))) {
    flows.push({ date: row.paidDate, amount: Number(row.amount) || 0, direction: 'out' });
  }
  for (const mod of ASSET_MODULES) {
    for (const row of settledRows(db.list(mod.payments))) {
      flows.push({ date: row.paidDate, amount: Number(row.amount) || 0, direction: row.direction === 'received' ? 'in' : 'out' });
    }
  }
  // Advance-offset commission payments (source: 'advance') don't move new
  // cash - the cash already left the business when the advance itself was
  // given, counted below - so only real cash/cheque/pay-order settlements
  // count here.
  for (const row of settledRows(db.list('brokerCommissionPayments'))) {
    if (row.source === 'advance') continue;
    flows.push({ date: row.paidDate, amount: Number(row.amount) || 0, direction: 'out' });
  }
  for (const row of db.list('brokerAdvances')) {
    flows.push({ date: row.date || row.createdAt, amount: Number(row.amount) || 0, direction: 'out' });
  }
  return flows;
}

// Money in / out / net grouped by calendar year, across every module.
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

  for (const flow of collectMoneyFlows()) {
    const y = yearOf(flow.date);
    if (!y) continue;
    if (flow.direction === 'in') bucket(y).moneyIn += flow.amount;
    else bucket(y).moneyOut += flow.amount;
  }

  const result = Object.values(years)
    .map((b) => ({ year: b.year, moneyIn: round2(b.moneyIn), moneyOut: round2(b.moneyOut), net: round2(b.moneyIn - b.moneyOut) }))
    .sort((a, b) => a.year - b.year);
  res.json(result);
});

// Money in / out / net grouped by calendar month (across every year there's
// data for) - the finer-grained series the Reports page uses to compare
// month-over-month and year-over-year growth, since a single yearly number
// hides whether a business is actually speeding up or slowing down.
router.get('/dashboard/monthly', (req, res) => {
  const months = {};
  function bucket(year, month) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (!months[key]) months[key] = { year, month, moneyIn: 0, moneyOut: 0 };
    return months[key];
  }
  function monthOf(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }

  for (const flow of collectMoneyFlows()) {
    const mo = monthOf(flow.date);
    if (!mo) continue;
    const b = bucket(mo.year, mo.month);
    if (flow.direction === 'in') b.moneyIn += flow.amount;
    else b.moneyOut += flow.amount;
  }

  const result = Object.values(months)
    .map((b) => ({ year: b.year, month: b.month, moneyIn: round2(b.moneyIn), moneyOut: round2(b.moneyOut), net: round2(b.moneyIn - b.moneyOut) }))
    .sort((a, b) => a.year - b.year || a.month - b.month);
  res.json(result);
});

// Every still-pending amount the business itself owes (to land/shop/
// commercial sellers, and colony development contractors) - deliberately
// EXCLUDING broker commission, which is tracked and paid on its own
// separate schedule under Brokers Commission rather than mixed into this
// "what cash do we need ready, and by when" view. Colony plot payments are
// also excluded since those are money coming IN from buyers, not owed out.
function upcomingPayableRows() {
  const rows = [];
  for (const expense of pendingRows(db.list('colonyExpenses'))) {
    rows.push({ amount: Number(expense.amount) || 0, dueDate: expense.dueDate });
  }
  for (const mod of ASSET_MODULES) {
    for (const row of pendingRows(db.list(mod.payments), 'paid')) {
      rows.push({ amount: Number(row.amount) || 0, dueDate: row.dueDate });
    }
  }
  return rows;
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date, months) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

// How much money needs to be ready within each upcoming horizon - a
// cumulative "cash runway" view (Next 3 Months already includes everything
// due within Next 1 Month, and so on), so the client can see at a glance
// what needs to be set aside over different planning windows. Anything
// already overdue, or with no due date set at all, is treated as needed
// right away and so counts toward every horizon.
router.get('/dashboard/payables-horizon', (req, res) => {
  const rows = upcomingPayableRows();
  const today = startOfToday();
  const horizonDefs = [
    { key: 'days15', label: 'Next 15 Days', end: addDays(today, 15) },
    { key: 'month1', label: 'Next 1 Month', end: addMonths(today, 1) },
    { key: 'month3', label: 'Next 3 Months', end: addMonths(today, 3) },
    { key: 'month6', label: 'Next 6 Months', end: addMonths(today, 6) },
    { key: 'year1', label: 'Next 1 Year', end: addMonths(today, 12) },
    { key: 'month15', label: 'Next 15 Months', end: addMonths(today, 15) },
    { key: 'month18', label: 'Next 18 Months', end: addMonths(today, 18) },
  ];
  const horizons = horizonDefs.map((h) => ({
    key: h.key,
    label: h.label,
    amount: round2(
      rows
        .filter((r) => !r.dueDate || new Date(r.dueDate) <= h.end)
        .reduce((sum, r) => sum + r.amount, 0)
    ),
  }));
  const totalPayableExcludingCommission = round2(rows.reduce((sum, r) => sum + r.amount, 0));
  res.json({ excludesBrokerCommission: true, horizons, totalPayableExcludingCommission });
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

  for (const broker of db.list('brokers')) {
    const deals = db.list('brokerDeals', (d) => d.brokerId === broker.id);
    const dealById = new Map(deals.map((d) => [d.id, d]));
    const dealIds = new Set(deals.map((d) => d.id));
    // Advance-offset settlements don't move new cash (see collectMoneyFlows
    // above), so they're left out of this cash ledger - the advance itself,
    // below, is the entry that represents that money actually leaving.
    for (const row of settledRows(db.list('brokerCommissionPayments', (p) => dealIds.has(p.parentId)))) {
      if (row.source === 'advance') continue;
      const deal = dealById.get(row.parentId);
      entries.push({
        date: row.paidDate,
        module: 'Brokers Commission',
        context: `${broker.name} - ${deal ? deal.description : ''}`,
        direction: 'out',
        amount: row.amount,
        notes: row.notes,
      });
    }
    for (const advance of db.list('brokerAdvances', (a) => a.brokerId === broker.id)) {
      entries.push({
        date: advance.date || advance.createdAt,
        module: 'Brokers Commission',
        context: `${broker.name} - Advance given`,
        direction: 'out',
        amount: advance.amount,
        notes: advance.notes,
      });
    }
  }

  entries.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  res.json(entries);
});

module.exports = router;
