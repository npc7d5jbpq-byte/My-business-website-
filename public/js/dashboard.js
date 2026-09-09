(async function () {
  const session = await initShell('index.html');
  if (!session) return;
  setPageTitle('Dashboard');

  try {
    const [overview, upcoming] = await Promise.all([
      apiRequest('/dashboard'),
      apiRequest('/dashboard/upcoming'),
    ]);
    renderOverview(overview);
    renderUpcoming(upcoming);
  } catch (err) {
    showBanner(err.message);
  }

  function renderOverview(data) {
    const t = data.totals;
    document.getElementById('overview-tiles').innerHTML = `
      <div class="card stat-tile accent-success">
        <span class="label">Total Money In</span>
        <span class="value">${formatCurrency(t.totalMoneyIn)}</span>
        <span class="sub">Received across all business lines</span>
      </div>
      <div class="card stat-tile accent-danger">
        <span class="label">Total Money Out</span>
        <span class="value">${formatCurrency(t.totalMoneyOut)}</span>
        <span class="sub">Spent / paid across all business lines</span>
      </div>
      <div class="card stat-tile accent-info">
        <span class="label">Total Receivable</span>
        <span class="value">${formatCurrency(t.totalReceivable)}</span>
        <span class="sub">Still owed to the business</span>
      </div>
      <div class="card stat-tile accent-gold">
        <span class="label">Net Profit</span>
        <span class="value">${formatCurrency(t.netProfit)}</span>
        <span class="sub">Cash-basis profit to date</span>
      </div>
    `;

    const modules = [
      {
        title: 'Commercial Colonies',
        href: 'colonies.html',
        lines: [
          [`${data.colonySummary.count} colonies`, `${data.colonySummary.soldPlots}/${data.colonySummary.totalPlots} plots sold`],
          ['Received', formatCurrency(data.colonySummary.totalReceived)],
          ['Receivable', formatCurrency(data.colonySummary.totalReceivable)],
          ['Profit (projected)', formatCurrency(data.colonySummary.projectedProfit)],
        ],
      },
      ...data.assetSummaries.map((m) => ({
        title: m.label,
        href: m.label === 'Agricultural Land' ? 'agricultural.html' : (m.label === 'Shops' ? 'shops.html' : 'commercial.html'),
        lines: [
          [`${m.count} records`, ''],
          ['Paid out', formatCurrency(m.totalPaid)],
          ['Received', formatCurrency(m.totalReceived)],
          ['Profit on sold', formatCurrency(m.profit)],
        ],
      })),
    ];

    document.getElementById('module-tiles').innerHTML = modules.map((m) => `
      <a class="card" href="${m.href}" style="display:block">
        <div style="font-weight:700; margin-bottom:10px;">${escapeHtml(m.title)}</div>
        ${m.lines.map(([a, b]) => `
          <div style="display:flex; justify-content:space-between; font-size:12.5px; color:var(--text-muted); padding:4px 0;">
            <span>${escapeHtml(a)}</span><span style="color:var(--text); font-weight:600;">${escapeHtml(b)}</span>
          </div>`).join('')}
      </a>
    `).join('');
  }

  function renderUpcoming(items) {
    const body = document.getElementById('upcoming-body');
    if (!items.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="6">Nothing pending — everything is up to date.</td></tr>';
      return;
    }
    const directionLabel = { paid: 'To pay', received: 'To receive', task: 'Task' };
    body.innerHTML = items.slice(0, 40).map((it) => `
      <tr>
        <td>${escapeHtml(it.module)}</td>
        <td>${escapeHtml(it.context)}${it.notes ? `<div class="text-muted" style="font-size:11.5px;">${escapeHtml(it.notes)}</div>` : ''}</td>
        <td>${escapeHtml(it.person || '—')}</td>
        <td>${directionLabel[it.direction] || ''}</td>
        <td class="text-right num">${it.amount ? formatCurrency(it.amount) : '—'}</td>
        <td class="num">${formatDate(it.dueDate)} ${it.overdue ? '<div class="overdue-tag">OVERDUE</div>' : ''}</td>
      </tr>
    `).join('');
  }
})();
