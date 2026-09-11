// Two convenience lookups that cut across every other module instead of
// living inside one of them:
//
//  - GET /search?q=...      - one box, searches colonies/plots/agricultural
//                              land/shops/commercial/brokers/people at once
//                              by name, phone, CNIC, or plot number.
//  - GET /person?name=...   - every deal a single person has ever had with
//                              the office, wherever it lives (a buyer on a
//                              plot, a seller of agricultural land, or a
//                              manually-added Person from src/routes/
//                              people.js), gathered onto one page.
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
const { computePersonStats, computeDealStats } = require('./people');

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

  for (const person of db.list('people')) {
    if (anyMatch(q, person.name, person.phone, person.cnic)) {
      results.push({
        type: 'person', module: 'Person',
        label: person.name,
        sublabel: person.phone || '',
        url: `people-detail.html?id=${person.id}`,
      });
    }
  }

  // Colonies first (broadest), then everything else in the order found -
  // capped well above what anyone would actually scroll through.
  res.json({ results: results.slice(0, 60) });
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

  // A matching manually-added Person (src/routes/people.js) - folded in
  // here too, so someone who's e.g. both a colony buyer AND has a manual
  // deal recorded there shows up completely in this one view, with a link
  // through to their own dedicated page for managing those deals.
  const personEntity = db.list('people', (p) => norm(p.name) === name)[0] || null;
  let personDeals = [];
  if (personEntity) {
    personDeals = db
      .list('peopleDeals', (d) => d.personId === personEntity.id)
      .map((d) => {
        const payments = db.list('peoplePayments', (p) => p.parentId === d.id);
        return Object.assign({}, d, { payments, stats: computeDealStats(d, payments) });
      });
  }

  if (!plots.length && !assets.length && !brokers.length && !personEntity) {
    return res.status(404).json({ error: 'No records found for this person. Names are matched exactly (case-insensitive) - check the spelling matches what was entered elsewhere.' });
  }

  res.json({
    name: rawName,
    plots,
    assets,
    brokers,
    person: personEntity ? Object.assign({}, personEntity, { stats: computePersonStats(personEntity), deals: personDeals }) : null,
  });
});

module.exports = router;
