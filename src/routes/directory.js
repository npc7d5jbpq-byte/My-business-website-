// Two convenience lookups that cut across every other module instead of
// living inside one of them:
//
//  - GET /search?q=...      - one box, searches colonies/plots/agricultural
//                              land/shops/commercial/brokers at once by
//                              name, phone, CNIC, or plot number.
//  - GET /person?name=...   - every deal a single person has ever had with
//                              the office, wherever it lives (a buyer on a
//                              plot AND a seller of agricultural land, say),
//                              gathered onto one page.
//
// Both are read-only and deliberately simple: a case-insensitive substring
// match for search, and a case-insensitive exact match (after trimming) for
// the person view, since that one merges records together and a loose
// match there risks folding two different people into one.

const express = require('express');
const db = require('../db');
const { sumAmount, settledRows, round2 } = require('../finance');
const { computeAssetStats } = require('./assetModule');
const { computeBrokerStats } = require('./brokers');

const router = express.Router();

const ASSET_TYPES = [
  { type: 'agricultural', collection: 'agriculturalLands', paymentsCollection: 'agriculturalPayments', label: 'Agricultural Land' },
  { type: 'shops', collection: 'shops', paymentsCollection: 'shopPayments', label: 'Shops' },
  { type: 'commercial', collection: 'commercialLands', paymentsCollection: 'commercialPayments', label: 'Commercial Land & Plots' },
];

function norm(s) {
  return String(s || '').toLowerCase().trim();
}

function anyMatch(q, ...fields) {
  return fields.some((f) => f && norm(f).includes(q));
}

// ---- Global search ----

router.get('/search', (req, res) => {
  const q = norm(req.query.q);
  if (!q || q.length < 2) return res.json({ results: [] });
  const results = [];

  for (const colony of db.list('colonies')) {
    if (anyMatch(q, colony.name, colony.location)) {
      results.push({
        type: 'colony', module: 'Colony',
        label: colony.name,
        sublabel: colony.location || '',
        url: `colony.html?id=${colony.id}`,
      });
    }
  }

  for (const plot of db.list('plots')) {
    if (anyMatch(q, plot.plotNumber, plot.buyerName, plot.buyerPhone, plot.buyerCnic)) {
      const colony = db.get('colonies', plot.colonyId);
      results.push({
        type: 'plot', module: 'Colony Plot',
        label: `Plot ${plot.plotNumber}${colony ? ' — ' + colony.name : ''}`,
        sublabel: plot.buyerName ? `Buyer: ${plot.buyerName}` : (plot.status ? plot.status[0].toUpperCase() + plot.status.slice(1) : ''),
        url: `plot.html?colonyId=${plot.colonyId}&plotId=${plot.id}`,
      });
    }
  }

  for (const { type, collection, label } of ASSET_TYPES) {
    for (const entity of db.list(collection)) {
      if (anyMatch(q, entity.title, entity.location, entity.sellerName, entity.sellerPhone, entity.buyerName, entity.buyerPhone)) {
        results.push({
          type: 'asset', module: label,
          label: entity.title,
          sublabel: entity.buyerName ? `Buyer: ${entity.buyerName}` : (entity.sellerName ? `Seller: ${entity.sellerName}` : ''),
          url: `asset-detail.html?type=${type}&id=${entity.id}`,
        });
      }
    }
  }

  for (const broker of db.list('brokers')) {
    if (anyMatch(q, broker.name, broker.phone, broker.cnic)) {
      results.push({
        type: 'broker', module: 'Broker',
        label: broker.name,
        sublabel: broker.phone || '',
        url: `broker.html?id=${broker.id}`,
      });
    }
  }

  // Colonies first (broadest), then everything else in the order found -
  // capped well above what anyone would actually scroll through.
  res.json({ results: results.slice(0, 60) });
});

// ---- People directory ----
//
// One row per distinct person (matched the same case-insensitive way as
// the person view above) across every buyer/seller/broker in the system,
// with a quick-glance summary - so the office can browse everyone they've
// ever dealt with instead of only reaching a person by clicking their name
// somewhere else first.

router.get('/people', (req, res) => {
  const people = new Map(); // norm(name) -> summary row being built

  function ensure(rawName) {
    const key = norm(rawName);
    if (!key) return null;
    if (!people.has(key)) {
      people.set(key, { name: String(rawName).trim(), phone: '', roles: new Set(), recordCount: 0, owedToOffice: 0, owedToThem: 0 });
    }
    return people.get(key);
  }

  for (const plot of db.list('plots')) {
    const p = ensure(plot.buyerName);
    if (!p) continue;
    if (!p.phone && plot.buyerPhone) p.phone = plot.buyerPhone;
    p.roles.add('Buyer');
    p.recordCount += 1;
    if (plot.status !== 'cancelled') {
      const payments = db.list('plotPayments', (pay) => pay.parentId === plot.id);
      const received = round2(sumAmount(settledRows(payments)));
      p.owedToOffice += Math.max(0, round2((Number(plot.price) || 0) - received));
    }
  }

  for (const { collection, paymentsCollection } of ASSET_TYPES) {
    for (const entity of db.list(collection)) {
      const payments = db.list(paymentsCollection, (pay) => pay.parentId === entity.id);
      const stats = computeAssetStats(entity, payments);
      const buyer = ensure(entity.buyerName);
      if (buyer) {
        if (!buyer.phone && entity.buyerPhone) buyer.phone = entity.buyerPhone;
        buyer.roles.add('Buyer');
        buyer.recordCount += 1;
        if (entity.status !== 'cancelled') buyer.owedToOffice += Math.max(0, stats.totalReceivable);
      }
      const seller = ensure(entity.sellerName);
      if (seller) {
        if (!seller.phone && entity.sellerPhone) seller.phone = entity.sellerPhone;
        seller.roles.add('Seller');
        seller.recordCount += 1;
        seller.owedToThem += Math.max(0, stats.totalPayable);
      }
    }
  }

  for (const broker of db.list('brokers')) {
    const p = ensure(broker.name);
    if (!p) continue;
    if (!p.phone && broker.phone) p.phone = broker.phone;
    p.roles.add('Broker');
    p.recordCount += 1;
    p.owedToThem += Math.max(0, computeBrokerStats(broker).totalPending);
  }

  const rows = Array.from(people.values())
    .map((p) => ({
      name: p.name,
      phone: p.phone,
      roles: Array.from(p.roles).sort(),
      recordCount: p.recordCount,
      owedToOffice: round2(p.owedToOffice),
      owedToThem: round2(p.owedToThem),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json(rows);
});

// ---- Unified person view ----

router.get('/person', (req, res) => {
  const rawName = req.query.name;
  const name = norm(rawName);
  if (!name) return res.status(400).json({ error: 'A name is required.' });

  const plots = db
    .list('plots', (p) => norm(p.buyerName) === name)
    .map((p) => {
      const colony = db.get('colonies', p.colonyId);
      const payments = db.list('plotPayments', (pay) => pay.parentId === p.id);
      const received = round2(sumAmount(settledRows(payments)));
      const remaining = round2((Number(p.price) || 0) - received);
      return Object.assign({}, p, {
        colonyId: p.colonyId,
        colonyName: colony ? colony.name : '(colony deleted)',
        received,
        remaining,
      });
    });

  const assets = [];
  for (const { type, collection, paymentsCollection, label } of ASSET_TYPES) {
    for (const entity of db.list(collection)) {
      const isBuyer = norm(entity.buyerName) === name;
      const isSeller = norm(entity.sellerName) === name;
      if (!isBuyer && !isSeller) continue;
      const payments = db.list(paymentsCollection, (p) => p.parentId === entity.id);
      assets.push(Object.assign({}, entity, {
        assetType: type,
        moduleLabel: label,
        role: isBuyer ? 'buyer' : 'seller',
        stats: computeAssetStats(entity, payments),
      }));
    }
  }

  const brokers = db
    .list('brokers', (b) => norm(b.name) === name)
    .map((b) => Object.assign({}, b, { stats: computeBrokerStats(b) }));

  if (!plots.length && !assets.length && !brokers.length) {
    return res.status(404).json({ error: 'No records found for this person. Names are matched exactly (case-insensitive) - check the spelling matches what was entered elsewhere.' });
  }

  res.json({ name: rawName, plots, assets, brokers });
});

module.exports = router;
