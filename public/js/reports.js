(async function () {
  const session = await initShell('reports.html');
  if (!session) return;
  setPageTitle('Reports & Ledger');

  let ledger = [];
  let currentFilter = 'all';

  document.getElementById('yearly-body').innerHTML = skeletonRows(2, 4);
  document.getElementById('ledger-body').innerHTML = skeletonRows(5, 5);

  try {
    const [yearly, ledgerData] = await Promise.all([
      apiRequest('/dashboard/yearly'),
      apiRequest('/dashboard/ledger'),
    ]);
    renderYearly(yearly);
    ledger = ledgerData;
    renderLedger();
  } catch (err) {
    showBanner(err.message);
  }

  function renderYearly(years) {
    const body = document.getElementById('yearly-body');
    if (!years.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="4">No settled transactions recorded yet.</td></tr>';
      return;
    }
    body.innerHTML = years.map((y) => `
      <tr>
        <td style="font-weight:700;">${y.year}</td>
        <td class="text-right num" style="color:var(--success);">${formatCurrency(y.moneyIn)}</td>
        <td class="text-right num" style="color:var(--danger);">${formatCurrency(y.moneyOut)}</td>
        <td class="text-right num" style="font-weight:700; color:${y.net >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatCurrency(y.net)}</td>
      </tr>
    `).join('');
    staggerRows(body, { stepMs: 50 });
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
