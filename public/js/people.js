(async function () {
  const session = await initShell('people.html');
  if (!session) return;
  setPageTitle('People');

  let people = [];

  document.getElementById('people-body').innerHTML = skeletonRows(5, 6);

  async function load() {
    try {
      people = await apiRequest('/people');
      render();
    } catch (err) {
      showBanner(err.message);
    }
  }

  const ROLE_BADGE = { Buyer: 'badge-success', Seller: 'badge-info', Broker: 'badge-warning' };

  function render() {
    const q = (document.getElementById('people-search').value || '').toLowerCase().trim();
    const rows = q ? people.filter((p) => p.name.toLowerCase().includes(q) || (p.phone || '').toLowerCase().includes(q)) : people;
    const body = document.getElementById('people-body');
    if (!rows.length) {
      body.innerHTML = `<tr class="empty-row"><td colspan="6">${people.length ? 'No people match your search.' : 'No people recorded yet — they show up here as soon as they appear as a buyer, seller, or broker anywhere in the system.'}</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((p) => `
      <tr>
        <td style="font-weight:700;">${personLink(p.name)}</td>
        <td>${escapeHtml(p.phone || '—')}</td>
        <td>${p.roles.map((r) => `<span class="badge ${ROLE_BADGE[r] || 'badge-muted'}" style="margin-right:4px;">${escapeHtml(r)}</span>`).join('')}</td>
        <td class="text-right num">${p.recordCount}</td>
        <td class="text-right num" style="color:${p.owedToOffice > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${formatCurrency(p.owedToOffice)}</td>
        <td class="text-right num" style="color:${p.owedToThem > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${formatCurrency(p.owedToThem)}</td>
      </tr>
    `).join('');
    staggerRows(body, { stepMs: 25, maxDelayMs: 220 });
  }

  document.getElementById('people-search').addEventListener('input', render);

  load();
})();
