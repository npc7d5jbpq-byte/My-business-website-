(async function () {
  const session = await initShell('reports.html');
  if (!session) return;
  setPageTitle('Reports & Ledger');

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let ledger = [];
  let currentFilter = 'all';

  document.getElementById('growth-tiles').innerHTML = skeletonCards(2);
  document.getElementById('cash-position-body').innerHTML = skeletonRows(2, 4);
  document.getElementById('yearly-body').innerHTML = skeletonRows(2, 5);
  document.getElementById('monthly-body').innerHTML = skeletonRows(3, 5);
  document.getElementById('ledger-body').innerHTML = skeletonRows(5, 5);

  try {
    const [yearly, monthly, ledgerData, cashPosition] = await Promise.all([
      apiRequest('/dashboard/yearly'),
      apiRequest('/dashboard/monthly'),
      apiRequest('/dashboard/ledger'),
      apiRequest('/dashboard/cash-position'),
    ]);
    renderGrowthTiles(yearly, monthly);
    renderCashPosition(cashPosition.rows);
    renderYearly(yearly);
    renderMonthly(monthly);
    ledger = ledgerData;
    renderLedger();
  } catch (err) {
    showBanner(err.message);
  }

  function renderCashPosition(rows) {
    const body = document.getElementById('cash-position-body');
    if (!rows.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="4">No settled transactions recorded yet.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((r) => `
      <tr>
        <td style="font-weight:700;">${escapeHtml(r.label)}</td>
        <td class="text-right num" style="color:var(--success);">${formatCurrency(r.totalIn)}</td>
        <td class="text-right num" style="color:var(--danger);">${formatCurrency(r.totalOut)}</td>
        <td class="text-right num" style="font-weight:700; color:${r.balance >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatCurrency(r.balance)}</td>
      </tr>
    `).join('');
    const totalBalance = round2(rows.reduce((sum, r) => sum + r.balance, 0));
    body.innerHTML += `
      <tr style="border-top:2px solid var(--border);">
        <td style="font-weight:700;">Total</td>
        <td class="text-right num" style="font-weight:700; color:var(--success);">${formatCurrency(round2(rows.reduce((sum, r) => sum + r.totalIn, 0)))}</td>
        <td class="text-right num" style="font-weight:700; color:var(--danger);">${formatCurrency(round2(rows.reduce((sum, r) => sum + r.totalOut, 0)))}</td>
        <td class="text-right num" style="font-weight:700; color:${totalBalance >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatCurrency(totalBalance)}</td>
      </tr>
    `;
    staggerRows(body, { stepMs: 40 });
  }

  // Returns { diff, pctLabel, up } comparing curr to prev, or null if there's
  // no previous period to compare against yet.
  function growth(curr, prev) {
    if (prev == null) return null;
    const diff = round2(curr - prev);
    if (prev === 0) {
      if (diff === 0) return { diff, pctLabel: '—', up: null };
      return { diff, pctLabel: diff > 0 ? 'New' : '—', up: diff > 0 };
    }
    const pct = (diff / Math.abs(prev)) * 100;
    return { diff, pctLabel: `${Math.abs(pct).toFixed(1)}%`, up: diff >= 0 };
  }

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function growthCellHtml(g) {
    if (!g) return '<span class="text-muted">—</span>';
    if (g.up === null) return '<span class="text-muted">No change</span>';
    const color = g.up ? 'var(--success)' : 'var(--danger)';
    const arrow = g.up ? '&#9650;' : '&#9660;';
    return `<span style="color:${color}; font-weight:700;">${arrow} ${g.pctLabel}</span>`;
  }

  function monthLabel(m) {
    return `${MONTH_NAMES[m.month - 1]} ${m.year}`;
  }

  // Two headline comparison cards - this month vs the previous recorded
  // month, and this year vs the previous recorded year - so the client can
  // see at a glance whether the business is growing without reading a table.
  function renderGrowthTiles(years, months) {
    const container = document.getElementById('growth-tiles');
    if (!years.length && !months.length) {
      container.innerHTML = '<div class="card"><span class="text-muted">Not enough settled transactions yet to compare growth.</span></div>';
      return;
    }
    function comparisonCard(title, curr, prev, labelOf) {
      if (!curr) {
        return `<div class="card"><div style="font-weight:700; margin-bottom:10px;">${title}</div><span class="text-muted">No data yet.</span></div>`;
      }
      const rows = [
        ['Money In', curr.moneyIn, prev ? prev.moneyIn : null, 'var(--success)'],
        ['Money Out', curr.moneyOut, prev ? prev.moneyOut : null, 'var(--danger)'],
        ['Net', curr.net, prev ? prev.net : null, curr.net >= 0 ? 'var(--success)' : 'var(--danger)'],
      ];
      return `
        <div class="card">
          <div style="font-weight:700; margin-bottom:2px;">${title}</div>
          <div class="text-muted" style="font-size:11.5px; margin-bottom:12px;">${labelOf(curr)}${prev ? ` · vs ${labelOf(prev)}` : ' · no earlier period to compare yet'}</div>
          ${rows.map(([label, currVal, prevVal, color]) => `
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:12.5px; padding:6px 0; border-top:1px solid var(--border);">
              <span class="text-muted">${label}</span>
              <span style="display:flex; gap:10px; align-items:center;">
                <span style="font-weight:700; color:${color};">${formatCurrency(currVal)}</span>
                ${growthCellHtml(growth(currVal, prevVal))}
              </span>
            </div>
          `).join('')}
        </div>
      `;
    }

    const thisMonth = months.length ? months[months.length - 1] : null;
    const lastMonth = months.length > 1 ? months[months.length - 2] : null;
    const thisYear = years.length ? years[years.length - 1] : null;
    const lastYear = years.length > 1 ? years[years.length - 2] : null;

    container.innerHTML =
      comparisonCard('This Month vs Last Month', thisMonth, lastMonth, monthLabel) +
      comparisonCard('This Year vs Last Year', thisYear, lastYear, (y) => String(y.year));
  }

  function renderYearly(years) {
    const body = document.getElementById('yearly-body');
    if (!years.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="5">No settled transactions recorded yet.</td></tr>';
      return;
    }
    body.innerHTML = years.map((y, i) => `
      <tr>
        <td style="font-weight:700;">${y.year}</td>
        <td class="text-right num" style="color:var(--success);">${formatCurrency(y.moneyIn)}</td>
        <td class="text-right num" style="color:var(--danger);">${formatCurrency(y.moneyOut)}</td>
        <td class="text-right num" style="font-weight:700; color:${y.net >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatCurrency(y.net)}</td>
        <td class="text-right num">${growthCellHtml(growth(y.net, i > 0 ? years[i - 1].net : null))}</td>
      </tr>
    `).join('');
    staggerRows(body, { stepMs: 50 });
  }

  function renderMonthly(months) {
    const body = document.getElementById('monthly-body');
    if (!months.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="5">No settled transactions recorded yet.</td></tr>';
      return;
    }
    // Most recent first, easier to spot the latest trend without scrolling.
    const ordered = months.slice().reverse();
    body.innerHTML = ordered.map((m) => {
      const originalIndex = months.indexOf(m);
      const prev = originalIndex > 0 ? months[originalIndex - 1] : null;
      return `
      <tr>
        <td style="font-weight:700;">${monthLabel(m)}</td>
        <td class="text-right num" style="color:var(--success);">${formatCurrency(m.moneyIn)}</td>
        <td class="text-right num" style="color:var(--danger);">${formatCurrency(m.moneyOut)}</td>
        <td class="text-right num" style="font-weight:700; color:${m.net >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatCurrency(m.net)}</td>
        <td class="text-right num">${growthCellHtml(growth(m.net, prev ? prev.net : null))}</td>
      </tr>
    `;
    }).join('');
    staggerRows(body, { stepMs: 30, maxDelayMs: 240 });
  }

  function renderLedger() {
    const body = document.getElementById('ledger-body');
    const rows = currentFilter === 'all' ? ledger : ledger.filter((r) => r.module === currentFilter);
    if (!rows.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="5">No transactions match this filter.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((r) => `
      <tr>
        <td class="num">${formatDate(r.date)}</td>
        <td>${escapeHtml(r.module)}</td>
        <td>${escapeHtml(r.context)}</td>
        <td class="text-muted">${escapeHtml(r.notes || '—')}</td>
        <td class="text-right num" style="font-weight:700; color:${r.direction === 'in' ? 'var(--success)' : 'var(--danger)'};">
          ${r.direction === 'in' ? '+' : '−'} ${formatCurrency(r.amount)}
        </td>
      </tr>
    `).join('');
    staggerRows(body, { stepMs: 25, maxDelayMs: 200 });
  }

  document.getElementById('module-filter').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-filter]');
    if (!tab) return;
    document.querySelectorAll('#module-filter .pill-tab').forEach((el) => el.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    renderLedger();
  });
})();
