(async function () {
  const session = await initShell('people.html');
  if (!session) return;
  setPageTitle('People');

  document.getElementById('people-body').innerHTML = skeletonRows(3, 5);

  async function load() {
    try {
      const people = await apiRequest('/people');
      render(people);
    } catch (err) {
      showBanner(err.message);
    }
  }

  function render(people) {
    const body = document.getElementById('people-body');
    if (!people.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="5">No people added yet. Click "Add Person" to create the first one.</td></tr>';
      return;
    }
    body.innerHTML = people.map((p) => `
      <tr>
        <td>
          ${personLink(p.name)}
          <div class="text-muted" style="font-size:11.5px;">${escapeHtml(p.phone || '')}</div>
        </td>
        <td>${p.stats.dealsCount}</td>
        <td class="text-right num" style="color:${p.stats.totalReceivable > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${formatCurrency(p.stats.totalReceivable)}</td>
        <td class="text-right num" style="color:${p.stats.totalPayable > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${formatCurrency(p.stats.totalPayable)}</td>
        <td>
          <div class="row-actions">
            <a class="btn btn-ghost btn-sm" href="people-detail.html?id=${p.id}">Open</a>
            <button class="btn btn-danger btn-sm" data-delete="${p.id}">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
    staggerRows(body, { stepMs: 40 });

    body.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', withButtonBusy(btn, async () => {
        if (!confirm('Delete this person and all of their deals and payment history? This cannot be undone.')) return;
        try {
          await apiRequest(`/people/${btn.dataset.delete}`, { method: 'DELETE' });
          load();
        } catch (err) {
          showBanner(err.message);
        }
      }));
    });
  }

  document.getElementById('add-person-btn').addEventListener('click', () => {
    openFormModal({
      title: 'Add Person',
      submitLabel: 'Add Person',
      fields: [
        { name: 'name', label: 'Name', required: true },
        { name: 'phone', label: 'Phone' },
        { name: 'cnic', label: 'CNIC' },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
      onSubmit: async (values) => {
        await apiRequest('/people', { method: 'POST', body: values });
        load();
      },
    });
  });

  load();
})();
