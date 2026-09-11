(async function () {
  const session = await initShell('');
  if (!session) return;

  const name = new URLSearchParams(window.location.search).get('name');
  if (!name) {
    document.body.innerHTML = '<p style="padding:40px;">No person specified. <a href="index.html">Back to Dashboard</a></p>';
    return;
  }

  const ASSET_NAV = { agricultural: 'agricultural.html', shops: 'shops.html', commercial: 'commercial.html' };

  document.getElementById('person-tiles').innerHTML = skeletonCards(4);
  document.getElementById('person-sections').innerHTML = skeletonRows(3, 4);

  async function load() {
    try {
      const data = await apiRequest(`/person?name=${encodeURIComponent(name)}`);
      renderAll(data);
    } catch (err) {
      document.getElementById('person-name').textContent = name;
      document.getElementById('person-sections').innerHTML = '';
      document.getElementById('person-tiles').innerHTML = '';
      showBanner(err.message);
    }
  }

  function tile(label, value, sub, accent, i) {
    return `<div class="card stat-tile ${accent || ''} entrance" style="animation-delay:${i * 55}ms"><span class="label">${label}</span><span class="value" data-countup="${value}">Rs. 0</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
  }

  function renderAll(data) {
    setPageTitle(data.name);
    document.getElementById('person-name').textContent = data.name;

    const personDealsCount = data.person ? data.person.deals.length : 0;
    const totalRecords = data.plots.length + data.assets.length + data.brokers.length + personDealsCount;

    // "Owed to the office" = this person is a buyer somewhere and hasn't
    // fully paid yet. "Owed to them" = the office still owes them, either
    // as a seller who hasn't been fully paid, or as a broker with pending
    // commission. Cancelled deals are excluded from both, same convention
    // as every other receivable/payable total in the app.
    let owedToOffice = 0;
    let owedToThem = 0;
    for (const p of data.plots) {
      if (p.status === 'cancelled') continue;
      owedToOffice += Math.max(0, Number(p.remaining) || 0);
    }
    for (const a of data.assets) {
      if (a.status === 'cancelled') continue;
      if (a.role === 'buyer') owedToOffice += Math.max(0, Number(a.stats.totalReceivable) || 0);
      else owedToThem += Math.max(0, Number(a.stats.totalPayable) || 0);
    }
    for (const b of data.brokers) {
      owedToThem += Math.max(0, Number(b.stats.totalPending) || 0);
    }
    if (data.person) {
      owedToOffice += Math.max(0, Number(data.person.stats.totalReceivable) || 0);
      owedToThem += Math.max(0, Number(data.person.stats.totalPayable) || 0);
    }

    const tiles = [
      tile('Total Records', totalRecords, `${data.plots.length} plot${data.plots.length === 1 ? '' : 's'} · ${data.assets.length} other deal${data.assets.length === 1 ? '' : 's'} · ${data.brokers.length} broker profile${data.brokers.length === 1 ? '' : 's'}${data.person ? ` · ${personDealsCount} general deal${personDealsCount === 1 ? '' : 's'}` : ''}`, '', 0),
      tile('Still Owed to the Office', owedToOffice, 'From plots/deals bought from us', owedToOffice > 0 ? 'accent-danger' : '', 1),
      tile('Still Owed to Them', owedToThem, 'From sales to us, or broker commission', owedToThem > 0 ? 'accent-danger' : '', 2),
    ];
    const tilesEl = document.getElementById('person-tiles');
    tilesEl.innerHTML = tiles.join('');
    tilesEl.querySelectorAll('[data-countup]').forEach((el) => animateCountUp(el, Number(el.dataset.countup), { duration: 650 }));

    renderSections(data);
  }

  function renderSections(data) {
    const container = document.getElementById('person-sections');
    const parts = [];

    if (data.plots.length) {
      parts.push(`
        <div class="section-title"><h2>Commercial Colony Plots</h2></div>
        <div class="table-wrap" style="margin-bottom:24px;">
          <table>
            <thead><tr><th>Plot</th><th>Colony</th><th>Status</th><th class="text-right">Price</th><th class="text-right">Received</th><th class="text-right">Remaining</th><th></th></tr></thead>
            <tbody>
              ${data.plots.map((p) => `
                <tr>
                  <td style="font-weight:700;">${escapeHtml(p.plotNumber)}</td>
                  <td>${escapeHtml(p.colonyName)}</td>
                  <td>${statusBadge(p.status)}</td>
                  <td class="text-right num">${formatCurrency(p.price)}</td>
                  <td class="text-right num" style="color:var(--success);">${formatCurrency(p.received)}</td>
                  <td class="text-right num" style="color:${p.remaining > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${formatCurrency(p.remaining)}</td>
                  <td><a class="btn btn-ghost btn-sm" href="plot.html?colonyId=${encodeURIComponent(p.colonyId)}&plotId=${encodeURIComponent(p.id)}">Open</a></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `);
    }

    if (data.assets.length) {
      parts.push(`
        <div class="section-title"><h2>Agricultural Land / Shops / Commercial Land &amp; Plots</h2></div>
        <div class="table-wrap" style="margin-bottom:24px;">
          <table>
            <thead><tr><th>Record</th><th>Module</th><th>Role</th><th>Status</th><th class="text-right">Amount</th><th class="text-right">Remaining</th><th></th></tr></thead>
            <tbody>
              ${data.assets.map((a) => {
                const isBuyer = a.role === 'buyer';
                const amount = isBuyer ? a.salePrice : a.purchasePrice;
                const remaining = isBuyer ? a.stats.totalReceivable : a.stats.totalPayable;
                return `
                <tr>
                  <td style="font-weight:700;">${escapeHtml(a.title)}</td>
                  <td>${escapeHtml(a.moduleLabel)}</td>
                  <td><span class="badge ${isBuyer ? 'badge-success' : 'badge-info'}">${isBuyer ? 'Buyer' : 'Seller'}</span></td>
                  <td>${statusBadge(a.status)}</td>
                  <td class="text-right num">${formatCurrency(amount)}</td>
                  <td class="text-right num" style="color:${remaining > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${formatCurrency(remaining)}</td>
                  <td><a class="btn btn-ghost btn-sm" href="asset-detail.html?type=${encodeURIComponent(a.assetType)}&id=${encodeURIComponent(a.id)}">Open</a></td>
                </tr>
              `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `);
    }

    if (data.brokers.length) {
      parts.push(`
        <div class="section-title"><h2>Broker Profile${data.brokers.length === 1 ? '' : 's'}</h2></div>
        <div class="table-wrap" style="margin-bottom:24px;">
          <table>
            <thead><tr><th>Phone</th><th class="text-right">Deals</th><th class="text-right">Total Commission</th><th class="text-right">Paid</th><th class="text-right">Still Owed</th><th class="text-right">Advance Balance</th><th></th></tr></thead>
            <tbody>
              ${data.brokers.map((b) => `
                <tr>
                  <td>${escapeHtml(b.phone || '—')}</td>
                  <td class="text-right num">${b.stats.dealsCount}</td>
                  <td class="text-right num">${formatCurrency(b.stats.totalCommission)}</td>
                  <td class="text-right num" style="color:var(--success);">${formatCurrency(b.stats.totalPaid)}</td>
                  <td class="text-right num" style="color:${b.stats.totalPending > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${formatCurrency(b.stats.totalPending)}</td>
                  <td class="text-right num">${formatCurrency(b.stats.advanceBalance)}</td>
                  <td><a class="btn btn-ghost btn-sm" href="broker.html?id=${encodeURIComponent(b.id)}">Open</a></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `);
    }

    if (data.person) {
      const DIRECTION_LABEL = { receivable: 'They owe us', payable: 'We owe them' };
      parts.push(`
        <div class="section-title">
          <h2>General Deals</h2>
          <a class="btn btn-ghost btn-sm" href="people-detail.html?id=${encodeURIComponent(data.person.id)}">Manage in People &rarr;</a>
        </div>
        <p class="text-muted" style="font-size:12.5px; margin:-10px 0 14px;">Deals recorded directly against this person (not tied to a colony, land, shop, or commercial record) — loans, services, or any other regular business dealing.</p>
        <div class="table-wrap" style="margin-bottom:24px;">
          <table>
            <thead><tr><th>Deal</th><th>Type</th><th class="text-right">Amount</th><th class="text-right">Settled</th><th class="text-right">Remaining</th></tr></thead>
            <tbody>
              ${data.person.deals.length ? data.person.deals.map((d) => {
                const cancelled = d.status === 'cancelled';
                return `
                <tr style="${cancelled ? 'opacity:0.6;' : ''}">
                  <td style="font-weight:700;">
                    <span style="${cancelled ? 'text-decoration:line-through;' : ''}">${escapeHtml(d.description)}</span>
                    ${cancelled ? '<span class="badge badge-danger" style="margin-left:6px;">Cancelled</span>' : ''}
                  </td>
                  <td><span class="badge ${d.direction === 'payable' ? 'badge-danger' : 'badge-success'}">${DIRECTION_LABEL[d.direction] || d.direction}</span></td>
                  <td class="text-right num">${formatCurrency(d.stats.amount)}</td>
                  <td class="text-right num" style="color:var(--success);">${formatCurrency(d.stats.totalPaid)}</td>
                  <td class="text-right num" style="color:${!cancelled && d.stats.remaining > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${cancelled ? '<span class="text-muted">—</span>' : formatCurrency(d.stats.remaining)}</td>
                </tr>
              `;
              }).join('') : '<tr class="empty-row"><td colspan="5">No general deals recorded yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      `);
    }

    container.innerHTML = parts.join('') || '<p class="text-muted">No records found.</p>';
    container.querySelectorAll('.table-wrap tbody').forEach((body) => staggerRows(body, { stepMs: 30 }));
  }

  load();
  renderAttachmentsSection('person-documents', 'person', name);
})();
