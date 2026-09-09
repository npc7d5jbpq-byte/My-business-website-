(async function () {
  const session = await initShell('colonies.html');
  if (!session) return;
  setPageTitle('Commercial Colonies');

  document.getElementById('colonies-body').innerHTML = skeletonRows(3, 7);

  async function load() {
    try {
      const colonies = await apiRequest('/colonies');
      render(colonies);
    } catch (err) {
      showBanner(err.message);
    }
  }

  function render(colonies) {
    const body = document.getElementById('colonies-body');
    if (!colonies.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="7">No colonies yet. Click "Add Colony" to create the first one.</td></tr>';
      return;
    }
    body.innerHTML = colonies.map((c) => `
      <tr>
        <td>
          <a href="colony.html?id=${c.id}" style="font-weight:700;">${escapeHtml(c.name)}</a>
          <div class="text-muted" style="font-size:11.5px;">${escapeHtml(c.location || '')}</div>
        </td>
        <td>${c.stats.sold}/${c.stats.totalPlots} sold, ${c.stats.reserved} reserved, ${c.stats.available} available</td>
        <td style="min-width:120px;">
          <div class="progress"><div style="width:0%" data-width="${c.stats.percentSold}"></div></div>
          <div class="text-muted" style="font-size:11.5px; margin-top:4px;">${c.stats.percentSold}%</div>
        </td>
        <td class="text-right num" style="color:var(--success);">${formatCurrency(c.stats.totalReceived)}</td>
        <td class="text-right num" style="color:var(--info);">${formatCurrency(c.stats.totalReceivable)}</td>
        <td class="text-right num" style="font-weight:700; color:${c.stats.projectedProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatCurrency(c.stats.projectedProfit)}</td>
        <td>
          <div class="row-actions">
            <a class="btn btn-ghost btn-sm" href="colony.html?id=${c.id}">Open</a>
            <button class="btn btn-danger btn-sm" data-delete="${c.id}">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
    staggerRows(body, { stepMs: 40 });
    animateProgressBars(body);

    body.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this colony and all of its plots, payments, milestones and expenses? This cannot be undone.')) return;
        try {
          await apiRequest(`/colonies/${btn.dataset.delete}`, { method: 'DELETE' });
          load();
        } catch (err) {
          showBanner(err.message);
        }
      });
    });
  }

  document.getElementById('add-colony-btn').addEventListener('click', () => {
    openFormModal({
      title: 'Add Colony',
      submitLabel: 'Create Colony',
      fields: [
        { name: 'name', label: 'Colony name', required: true },
        { name: 'location', label: 'Location' },
        { name: 'acquisitionCost', label: 'Land acquisition / development cost (Rs.)', type: 'number', step: '0.01', value: '0' },
        { name: 'description', label: 'Description / notes', type: 'textarea' },
      ],
      onSubmit: async (values) => {
        await apiRequest('/colonies', { method: 'POST', body: values });
        load();
      },
    });
  });

  load();
})();
