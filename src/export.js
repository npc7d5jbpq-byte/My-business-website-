// A plain, non-technical Excel export of the whole business - the
// "readable file" counterpart to the JSON backups in src/backup.js (which
// are built for the app to restore, not for a person to open). Every sheet
// uses plain English column headers and real numbers/currency formatting,
// so it opens straight into something that looks like a normal business
// spreadsheet in Excel, Google Sheets, or LibreOffice - no JSON, no field
// names like `buyerCnic`.
//
// Generated automatically on the exact same schedule as the JSON backups
// (see runExportCycle() being called from src/backup.js's runBackupCycle)
// so a fresh, readable copy always exists without anyone needing to
// remember to make one - a manual "Export Now" button is also available
// for the same reason "Backup Now" is: peace of mind before something
// risky, or just wanting one right now.

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const db = require('./db');
const { sumAmount, settledRows, round2 } = require('./finance');
const { computeColonyStats } = require('./routes/colonies');
const { computeAssetStats } = require('./routes/assetModule');
const { computeBrokerStats } = require('./routes/brokers');
const { computePersonStats } = require('./routes/people');
const { buildLedgerEntries } = require('./routes/dashboard');

// Sibling of both the data folder and the backups folder (e.g.
// .../userData/data, .../userData/backups, .../userData/exports) - kept
// separate from both so browsing/deleting exports can never touch either.
const EXPORTS_DIR = path.join(path.dirname(db.DATA_DIR), 'exports');

const CURRENCY_FMT = '"Rs. "#,##0';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function timestampForFilename(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, '-');
}

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function capitalize(s) {
  return s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s;
}

const ASSET_TYPES = [
  { collection: 'agriculturalLands', paymentsCollection: 'agriculturalPayments', sheet: 'Agricultural Land' },
  { collection: 'shops', paymentsCollection: 'shopPayments', sheet: 'Shops' },
  { collection: 'commercialLands', paymentsCollection: 'commercialPayments', sheet: 'Commercial Land & Plots' },
];

function addSheet(workbook, name, columns, rows) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns;
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FF1C2434' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0E6D2' } };
  header.alignment = { vertical: 'middle' };
  rows.forEach((r) => sheet.addRow(r));
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return sheet;
}

function buildWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Gulberg City Office';
  workbook.created = new Date();

  // ---- Summary ----
  const colonies = db.list('colonies').map((c) => Object.assign({}, c, { stats: computeColonyStats(c) }));
  const brokers = db.list('brokers').map((b) => Object.assign({}, b, { stats: computeBrokerStats(b) }));
  const people = db.list('people').map((p) => Object.assign({}, p, { stats: computePersonStats(p) }));
  const assetsByType = ASSET_TYPES.map((t) => ({
    ...t,
    entities: db.list(t.collection).map((e) => Object.assign({}, e, {
      stats: computeAssetStats(e, db.list(t.paymentsCollection, (p) => p.parentId === e.id)),
    })),
  }));

  const summaryRows = [
    { module: 'Commercial Colonies', count: colonies.length,
      received: round2(colonies.reduce((s, c) => s + c.stats.totalReceived, 0)),
      receivable: round2(colonies.reduce((s, c) => s + c.stats.totalReceivable, 0)),
      paid: round2(colonies.reduce((s, c) => s + c.stats.totalExpensesPaid + c.stats.acquisitionCost, 0)),
      payable: round2(colonies.reduce((s, c) => s + c.stats.totalExpensesPending, 0)) },
    ...assetsByType.map((t) => ({
      module: t.sheet, count: t.entities.length,
      received: round2(t.entities.reduce((s, e) => s + e.stats.totalReceived, 0)),
      receivable: round2(t.entities.reduce((s, e) => s + e.stats.totalReceivable, 0)),
      paid: round2(t.entities.reduce((s, e) => s + e.stats.totalPaid, 0)),
      payable: round2(t.entities.reduce((s, e) => s + e.stats.totalPayable, 0)),
    })),
    { module: 'Brokers Commission', count: brokers.length,
      received: 0, receivable: 0,
      paid: round2(brokers.reduce((s, b) => s + b.stats.totalPaid, 0)),
      payable: round2(brokers.reduce((s, b) => s + b.stats.totalPending, 0)) },
    { module: 'People', count: people.length,
      received: round2(people.reduce((s, p) => s + p.stats.totalReceived, 0)),
      receivable: round2(people.reduce((s, p) => s + p.stats.totalReceivable, 0)),
      paid: round2(people.reduce((s, p) => s + p.stats.totalPaid, 0)),
      payable: round2(people.reduce((s, p) => s + p.stats.totalPayable, 0)) },
  ];
  addSheet(workbook, 'Summary', [
    { header: 'Module', key: 'module', width: 26 },
    { header: 'Records', key: 'count', width: 12 },
    { header: 'Received', key: 'received', width: 16, style: { numFmt: CURRENCY_FMT } },
    { header: 'Still Receivable', key: 'receivable', width: 16, style: { numFmt: CURRENCY_FMT } },
    { header: 'Paid Out', key: 'paid', width: 16, style: { numFmt: CURRENCY_FMT } },
    { header: 'Still Payable', key: 'payable', width: 16, style: { numFmt: CURRENCY_FMT } },
  ], summaryRows);

  // ---- Colonies ----
  addSheet(workbook, 'Colonies', [
    { header: 'Colony', key: 'name', width: 26 },
    { header: 'Location', key: 'location', width: 20 },
    { header: 'Total Plots', key: 'totalPlots', width: 12 },
    { header: 'Sold', key: 'sold', width: 10 },
    { header: 'Reserved', key: 'reserved', width: 10 },
    { header: 'Available', key: 'available', width: 10 },
    { header: 'Acquisition Cost', key: 'acquisitionCost', width: 16, style: { numFmt: CURRENCY_FMT } },
    { header: 'Received', key: 'totalReceived', width: 16, style: { numFmt: CURRENCY_FMT } },
    { header: 'Still Receivable', key: 'totalReceivable', width: 16, style: { numFmt: CURRENCY_FMT } },
    { header: 'Expenses Paid', key: 'totalExpensesPaid', width: 16, style: { numFmt: CURRENCY_FMT } },
    { header: 'Expenses Pending', key: 'totalExpensesPending', width: 16, style: { numFmt: CURRENCY_FMT } },
    { header: 'Projected Profit', key: 'projectedProfit', width: 16, style: { numFmt: CURRENCY_FMT } },
  ], colonies.map((c) => ({
    name: c.name, location: c.location || '', totalPlots: c.stats.totalPlots, sold: c.stats.sold,
    reserved: c.stats.reserved, available: c.stats.available, acquisitionCost: c.stats.acquisitionCost,
    totalReceived: c.stats.totalReceived, totalReceivable: c.stats.totalReceivable,
    totalExpensesPaid: c.stats.totalExpensesPaid, totalExpensesPending: c.stats.totalExpensesPending,
    projectedProfit: c.stats.projectedProfit,
  })));

  // ---- Colony Plots ----
  const colonyById = new Map(colonies.map((c) => [c.id, c]));
  const plotRows = db.list('plots').map((p) => {
    const colony = colonyById.get(p.colonyId);
    const payments = db.list('plotPayments', (pay) => pay.parentId === p.id);
    const received = round2(sumAmount(settledRows(payments)));
    return {
      colony: colony ? colony.name : '(deleted)', plotNumber: p.plotNumber, size: p.size || '',
      category: capitalize(p.category), status: capitalize(p.status),
      buyerName: p.buyerName || '', buyerPhone: p.buyerPhone || '', buyerCnic: p.buyerCnic || '',
      price: Number(p.price) || 0, discount: Number(p.discount) || 0, received,
      remaining: round2((Number(p.price) || 0) - received), saleDate: fmtDate(p.saleDate),
    };
  });
  addSheet(workbook, 'Colony Plots', [
    { header: 'Colony', key: 'colony', width: 22 },
    { header: 'Plot #', key: 'plotNumber', width: 12 },
    { header: 'Size', key: 'size', width: 12 },
    { header: 'Category', key: 'category', width: 12 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Buyer Name', key: 'buyerName', width: 20 },
    { header: 'Buyer Phone', key: 'buyerPhone', width: 16 },
    { header: 'Buyer CNIC', key: 'buyerCnic', width: 18 },
    { header: 'Price', key: 'price', width: 14, style: { numFmt: CURRENCY_FMT } },
    { header: 'Discount', key: 'discount', width: 12, style: { numFmt: CURRENCY_FMT } },
    { header: 'Received', key: 'received', width: 14, style: { numFmt: CURRENCY_FMT } },
    { header: 'Remaining', key: 'remaining', width: 14, style: { numFmt: CURRENCY_FMT } },
    { header: 'Sale Date', key: 'saleDate', width: 14 },
  ], plotRows);

  // ---- Colony Expenses ----
  const expenseRows = db.list('colonyExpenses').map((e) => {
    const colony = colonyById.get(e.colonyId);
    return {
      colony: colony ? colony.name : '(deleted)', title: e.title, category: capitalize(e.category),
      amount: Number(e.amount) || 0, dueDate: fmtDate(e.dueDate), paidDate: fmtDate(e.paidDate),
      status: e.paidDate ? 'Paid' : 'Pending', notes: e.notes || '',
    };
  });
  addSheet(workbook, 'Colony Expenses', [
    { header: 'Colony', key: 'colony', width: 22 },
    { header: 'Title', key: 'title', width: 26 },
    { header: 'Category', key: 'category', width: 14 },
    { header: 'Amount', key: 'amount', width: 14, style: { numFmt: CURRENCY_FMT } },
    { header: 'Due Date', key: 'dueDate', width: 14 },
    { header: 'Paid Date', key: 'paidDate', width: 14 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Notes', key: 'notes', width: 30 },
  ], expenseRows);

  // ---- Agricultural Land / Shops / Commercial Land & Plots ----
  for (const t of assetsByType) {
    const rows = t.entities.map((e) => ({
      title: e.title, location: e.location || '', area: e.area || '', status: capitalize(e.status),
      purchasePrice: Number(e.purchasePrice) || 0, purchaseDate: fmtDate(e.purchaseDate),
      sellerName: e.sellerName || '', sellerPhone: e.sellerPhone || '',
      totalPaid: e.stats.totalPaid, totalPayable: e.stats.totalPayable,
      salePrice: Number(e.salePrice) || 0, discount: Number(e.discount) || 0, saleDate: fmtDate(e.saleDate),
      buyerName: e.buyerName || '', buyerPhone: e.buyerPhone || '',
      totalReceived: e.stats.totalReceived, totalReceivable: e.stats.totalReceivable,
      profit: e.stats.profit,
    }));
    addSheet(workbook, t.sheet, [
      { header: 'Title', key: 'title', width: 22 },
      { header: 'Location', key: 'location', width: 18 },
      { header: 'Area / Size', key: 'area', width: 14 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Purchase Price', key: 'purchasePrice', width: 15, style: { numFmt: CURRENCY_FMT } },
      { header: 'Purchase Date', key: 'purchaseDate', width: 14 },
      { header: 'Seller Name', key: 'sellerName', width: 18 },
      { header: 'Seller Phone', key: 'sellerPhone', width: 15 },
      { header: 'Paid to Seller', key: 'totalPaid', width: 15, style: { numFmt: CURRENCY_FMT } },
      { header: 'Still Payable', key: 'totalPayable', width: 14, style: { numFmt: CURRENCY_FMT } },
      { header: 'Sale Price', key: 'salePrice', width: 14, style: { numFmt: CURRENCY_FMT } },
      { header: 'Discount', key: 'discount', width: 12, style: { numFmt: CURRENCY_FMT } },
      { header: 'Sale Date', key: 'saleDate', width: 14 },
      { header: 'Buyer Name', key: 'buyerName', width: 18 },
      { header: 'Buyer Phone', key: 'buyerPhone', width: 15 },
      { header: 'Received from Buyer', key: 'totalReceived', width: 17, style: { numFmt: CURRENCY_FMT } },
      { header: 'Still Receivable', key: 'totalReceivable', width: 15, style: { numFmt: CURRENCY_FMT } },
      { header: 'Profit', key: 'profit', width: 14, style: { numFmt: CURRENCY_FMT } },
    ], rows);
  }

  // ---- Brokers & their Deals ----
  addSheet(workbook, 'Brokers', [
    { header: 'Name', key: 'name', width: 20 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'CNIC', key: 'cnic', width: 18 },
    { header: 'Deals', key: 'dealsCount', width: 10 },
    { header: 'Total Commission', key: 'totalCommission', width: 16, style: { numFmt: CURRENCY_FMT } },
    { header: 'Paid', key: 'totalPaid', width: 14, style: { numFmt: CURRENCY_FMT } },
    { header: 'Still Owed', key: 'totalPending', width: 14, style: { numFmt: CURRENCY_FMT } },
    { header: 'Advance Balance', key: 'advanceBalance', width: 16, style: { numFmt: CURRENCY_FMT } },
  ], brokers.map((b) => ({
    name: b.name, phone: b.phone || '', cnic: b.cnic || '', dealsCount: b.stats.dealsCount,
    totalCommission: b.stats.totalCommission, totalPaid: b.stats.totalPaid,
    totalPending: b.stats.totalPending, advanceBalance: b.stats.advanceBalance,
  })));

  const brokerById = new Map(brokers.map((b) => [b.id, b]));
  const brokerDealRows = db.list('brokerDeals').map((d) => {
    const broker = brokerById.get(d.brokerId);
    const payments = db.list('brokerCommissionPayments', (p) => p.parentId === d.id);
    const paid = round2(sumAmount(settledRows(payments)));
    return {
      broker: broker ? broker.name : '(deleted)', description: d.description,
      dealValue: Number(d.dealValue) || 0, commissionPercent: Number(d.commissionPercent) || 0,
      commissionAmount: Number(d.commissionAmount) || 0, status: capitalize(d.status),
      paid, remaining: round2((Number(d.commissionAmount) || 0) - paid), dealDate: fmtDate(d.dealDate),
    };
  });
  addSheet(workbook, 'Broker Deals', [
    { header: 'Broker', key: 'broker', width: 20 },
    { header: 'Deal Description', key: 'description', width: 32 },
    { header: 'Deal Value', key: 'dealValue', width: 15, style: { numFmt: CURRENCY_FMT } },
    { header: 'Commission %', key: 'commissionPercent', width: 13 },
    { header: 'Commission Amount', key: 'commissionAmount', width: 17, style: { numFmt: CURRENCY_FMT } },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Paid', key: 'paid', width: 14, style: { numFmt: CURRENCY_FMT } },
    { header: 'Remaining', key: 'remaining', width: 14, style: { numFmt: CURRENCY_FMT } },
    { header: 'Deal Date', key: 'dealDate', width: 14 },
  ], brokerDealRows);

  // ---- People & their Deals ----
  addSheet(workbook, 'People', [
    { header: 'Name', key: 'name', width: 20 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'CNIC', key: 'cnic', width: 18 },
    { header: 'Deals', key: 'dealsCount', width: 10 },
    { header: 'Owed to Office', key: 'totalReceivable', width: 15, style: { numFmt: CURRENCY_FMT } },
    { header: 'Received From Them', key: 'totalReceived', width: 18, style: { numFmt: CURRENCY_FMT } },
    { header: 'Owed to Them', key: 'totalPayable', width: 15, style: { numFmt: CURRENCY_FMT } },
    { header: 'Paid to Them', key: 'totalPaid', width: 15, style: { numFmt: CURRENCY_FMT } },
  ], people.map((p) => ({
    name: p.name, phone: p.phone || '', cnic: p.cnic || '', dealsCount: p.stats.dealsCount,
    totalReceivable: p.stats.totalReceivable, totalReceived: p.stats.totalReceived,
    totalPayable: p.stats.totalPayable, totalPaid: p.stats.totalPaid,
  })));

  const personById = new Map(people.map((p) => [p.id, p]));
  const peopleDealRows = db.list('peopleDeals').map((d) => {
    const person = personById.get(d.personId);
    const payments = db.list('peoplePayments', (p) => p.parentId === d.id);
    const paid = round2(sumAmount(settledRows(payments)));
    return {
      person: person ? person.name : '(deleted)', description: d.description,
      type: d.direction === 'payable' ? 'We owe them' : 'They owe us',
      amount: Number(d.amount) || 0, status: capitalize(d.status),
      paid, remaining: round2((Number(d.amount) || 0) - paid), dealDate: fmtDate(d.dealDate),
    };
  });
  addSheet(workbook, 'People Deals', [
    { header: 'Person', key: 'person', width: 20 },
    { header: 'Deal Description', key: 'description', width: 32 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Amount', key: 'amount', width: 14, style: { numFmt: CURRENCY_FMT } },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Settled', key: 'paid', width: 14, style: { numFmt: CURRENCY_FMT } },
    { header: 'Remaining', key: 'remaining', width: 14, style: { numFmt: CURRENCY_FMT } },
    { header: 'Deal Date', key: 'dealDate', width: 14 },
  ], peopleDealRows);

  // ---- Full Ledger (every settled transaction, across every module) ----
  const ledgerRows = buildLedgerEntries().map((e) => ({
    date: fmtDate(e.date), module: e.module, details: e.context,
    direction: e.direction === 'in' ? 'Money In' : 'Money Out',
    amount: Number(e.amount) || 0, notes: e.notes || '',
  }));
  addSheet(workbook, 'Full Ledger', [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Module', key: 'module', width: 20 },
    { header: 'Details', key: 'details', width: 40 },
    { header: 'Direction', key: 'direction', width: 12 },
    { header: 'Amount', key: 'amount', width: 15, style: { numFmt: CURRENCY_FMT } },
    { header: 'Notes', key: 'notes', width: 30 },
  ], ledgerRows);

  return workbook;
}

// label: 'startup' | 'auto' | 'manual' | 'shutdown' | 'pre-restore' - same
// vocabulary as src/backup.js's takeBackup(), since every export is taken
// on the exact same trigger. Returns the filename, or null if there's
// nothing to export yet (mirrors takeBackup()'s "no data yet" case).
async function takeExport(label = 'auto') {
  ensureDir(EXPORTS_DIR);
  if (!fs.existsSync(db.DB_FILE)) return null;
  const workbook = buildWorkbook();
  const filename = `${label}__${timestampForFilename()}.xlsx`;
  const dest = path.join(EXPORTS_DIR, filename);
  const tmp = `${dest}.tmp`;
  await workbook.xlsx.writeFile(tmp);
  fs.renameSync(tmp, dest);
  return filename;
}

function listExports() {
  ensureDir(EXPORTS_DIR);
  return fs
    .readdirSync(EXPORTS_DIR)
    .filter((f) => f.endsWith('.xlsx'))
    .map((f) => {
      const stat = fs.statSync(path.join(EXPORTS_DIR, f));
      return { filename: f, label: f.split('__')[0], sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = { EXPORTS_DIR, buildWorkbook, takeExport, listExports };
