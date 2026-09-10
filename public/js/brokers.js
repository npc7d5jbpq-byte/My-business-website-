(async function () {
  const session = await initShell('brokers.html');
  if (!session) return;
  setPageTitle('Brokers Commission');

  document.getElementById('brokers-body').innerHTML = skeletonRows(3, 6);

  async function load() {
    try {
      const brokers = await apiRequest('/brokers');
      render(brokers);
    } catch (err) {
      showBanner(err.message);
    }
  }

  function render(brokers) {
    const body = document.getElementById('brokers-body');
    if (!brokers.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="6">No brokers yet. Click "Add Broker" to create the first one.</td></tr>';
      return;
    }
    body.innerHTML = brokers.map((b) => `
      <tr>
        <td>
          <a href="broker.html?id=${b.id}" style="font-weight:700;">${escapeHtml(b.name)}</a>
          <div class="text-muted" style="font-size:11.5px;">${escapeHtml(b.phone || '')}</div>
        </td>
        <td>${b.stats.dealsCount}</td>
        <td class="text-right num" style="font-weight:700;">${formatCurrency(b.stats.totalCommission)}</td>
        <td class="text-right num" style="color:var(--success);">${formatCurrency(b.stats.totalPaid)}</td>
        <td class="text-right num" style="color:${b.stats.totalPending > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${formatCurrency(b.stats.totalPending)}</td>
        <td>
          <div class="row-actions">
            <a class="btn btn-ghost btn-sm" href="broker.html?id=${b.id}">Open</a>
            <button class="btn btn-danger btn-sm" data-delete="${b.id}">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
    staggerRows(body, { stepMs: 40 });

    body.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', withButtonBusy(btn, async () => {
        if (!confirm('Delete this broker and all of their deals and commission payments? This cannot be undone.')) return;
        try {
          await apiRequest(`/brokers/${btn.dataset.delete}`, { method: 'DELETE' });
          load();
        } catch (err) {
          showBanner(err.message);
        }
      }));
    });
  }

  document.getElementById('add-broker-btn').addEventListener('click', () => {
    openFormModal({
      title: 'Add Broker',
      submitLabel: 'Add Broker',
      fields: [
        { name: 'name', label: 'Broker name', required: true },
        { name: 'phone', label: 'Phone' },
        { name: 'cnic', label: 'CNIC' },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
      onSubmit: async (values) => {
        await apiRequest('/brokers', { method: 'POST', body: values });
        load();
      },
    });
  });

  load();
})();
