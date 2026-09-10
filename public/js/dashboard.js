(async function () {
  const session = await initShell('index.html');
  if (!session) return;
  setPageTitle('Dashboard');

  // Skeleton placeholders while the first fetch is in flight, instead of
  // a bare "Loading…" - shaped like the real cards/table that replace them.
  document.getElementById('overview-tiles').innerHTML = skeletonCards(5);
  document.getElementById('module-tiles').innerHTML = skeletonCards(4);
  document.getElementById('upcoming-body').innerHTML = skeletonRows(4, 6);

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
    const profitAccent = t.netProfit >= 0 ? 'accent-success' : 'accent-danger';

    const tiles = [
      { accent: 'accent-success', label: 'Total Money In', value: t.totalMoneyIn, sub: 'Received across all business lines' },
      { accent: 'accent-danger', label: 'Total Money Out', value: t.totalMoneyOut, sub: 'Spent / paid across all business lines' },
      { accent: 'accent-info', label: 'Total Receivable', value: t.totalReceivable, sub: 'Still owed to the business' },
      { accent: 'accent-danger', label: 'Total Payable', value: t.totalPayable, sub: 'Still owed to sellers / contractors, not yet paid' },
      { accent: profitAccent, label: 'Net Profit', value: t.netProfit, sub: 'Cash-basis profit to date' },
    ];

    document.getElementById('overview-tiles').innerHTML = tiles.map((tile, i) => `
      <div class="card stat-tile ${tile.accent} entrance" style="animation-delay:${i * 70}ms">
        <span class="label">${escapeHtml(tile.label)}</span>
        <span class="value" data-countup="${tile.value}">Rs. 0</span>
        <span class="sub">${escapeHtml(tile.sub)}</span>
      </div>
    `).join('');
    document.querySelectorAll('#overview-tiles [data-countup]').forEach((el) => {
      animateCountUp(el, Number(el.dataset.countup), { duration: 750 });
    });

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
      {
        title: 'Brokers Commission',
        href: 'brokers.html',
        lines: [
          [`${data.brokerSummary.count} brokers`, ''],
          ['Total commission', formatCurrency(data.brokerSummary.totalCommission)],
          ['Paid so far', formatCurrency(data.brokerSummary.totalPaid)],
          ['Still to be given', formatCurrency(data.brokerSummary.totalPending)],
        ],
      },
    ];

    document.getElementById('module-tiles').innerHTML = modules.map((m, i) => `
      <a class="card entrance" href="${m.href}" style="display:block; animation-delay:${350 + i * 70}ms">
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
    staggerRows(body, { stepMs: 30, maxDelayMs: 240 });
  }
})();
