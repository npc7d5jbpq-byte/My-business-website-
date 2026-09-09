(async function () {
  const session = await initShell('colonies.html');
  if (!session) return;

  const colonyId = new URLSearchParams(window.location.search).get('id');
  if (!colonyId) {
    document.body.innerHTML = '<p style="padding:40px;">No colony specified. <a href="colonies.html">Back to Colonies</a></p>';
    return;
  }

  const state = { colony: null };
  const today = () => new Date().toISOString().slice(0, 10);

  async function load() {
    try {
      state.colony = await apiRequest(`/colonies/${colonyId}`);
      renderAll();
    } catch (err) {
      showBanner(err.message);
    }
  }

  function renderAll() {
    const c = state.colony;
    setPageTitle(c.name);
    document.getElementById('colony-name').textContent = c.name;
    document.getElementById('colony-location').textContent = c.location || 'No location set';
    renderTiles(c.stats);
    renderPlots(c.plots);
    renderMilestones(c.milestones);
    renderExpenses(c.expenses);
  }

  function tile(label, value, sub, accent) {
    return `<div class="card stat-tile ${accent || ''}"><span class="label">${label}</span><span class="value">${value}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
  }

  function renderTiles(s) {
    document.getElementById('colony-tiles').innerHTML = [
      tile('Plots Sold', `${s.sold}/${s.totalPlots}`, `${s.percentSold}% sold · ${s.reserved} reserved · ${s.available} available`),
      tile('Total Received', formatCurrency(s.totalReceived), 'From buyers so far', 'accent-success'),
      tile('Total Receivable', formatCurrency(s.totalReceivable), 'Still owed by buyers', 'accent-info'),
      tile('Projected Profit', formatCurrency(s.projectedProfit), 'Sale value − cost − all expenses', 'accent-gold'),
      tile('Acquisition / Dev. Cost', formatCurrency(s.acquisitionCost), 'Cost of the raw colony land'),
      tile('Expenses Paid', formatCurrency(s.totalExpensesPaid), 'Development spend so far', 'accent-danger'),
      tile('Expenses Pending', formatCurrency(s.totalExpensesPending), 'Planned but not yet paid'),
      tile('Cash Profit (so far)', formatCurrency(s.cashProfit), 'Received − cost − expenses paid', 'accent-gold'),
    ].join('');
  }

  // ---- Plots ----

  function renderPlots(plots) {
    const body = document.getElementById('plots-body');
    if (!plots.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="9">No plots added yet.</td></tr>';
      return;
    }
    body.innerHTML = plots.map((p) => `
      <tr>
        <td style="font-weight:700;">${escapeHtml(p.plotNumber)}</td>
        <td>${escapeHtml(p.size || '—')}</td>
        <td>${escapeHtml(p.category || '—')}</td>
        <td>${statusBadge(p.status)}</td>
        <td>${escapeHtml(p.buyerName || '—')}${p.buyerPhone ? `<div class="text-muted" style="font-size:11px;">${escapeHtml(p.buyerPhone)}</div>` : ''}</td>
        <td class="text-right num">${formatCurrency(p.price)}</td>
        <td class="text-right num">${formatCurrency(p.received)}</td>
        <td class="text-right num">${formatCurrency(p.remaining)}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm" data-pay="${p.id}">Payments</button>
            <button class="btn btn-ghost btn-sm" data-edit-plot="${p.id}">Edit</button>
            <button class="btn btn-danger btn-sm" data-delete-plot="${p.id}">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function plotFields(plot) {
    const v = plot || {};
    return [
      { name: 'plotNumber', label: 'Plot number', required: true, value: v.plotNumber },
      { name: 'size', label: 'Size (e.g. 5 Marla)', value: v.size },
      { name: 'category', label: 'Category', type: 'select', value: v.category || 'residential', options: [
        { value: 'residential', label: 'Residential' }, { value: 'commercial', label: 'Commercial' },
      ] },
      { name: 'price', label: 'Sale price (Rs.)', type: 'number', step: '0.01', value: v.price != null ? v.price : 0 },
      { name: 'status', label: 'Status', type: 'select', value: v.status || 'available', options: [
        { value: 'available', label: 'Available' }, { value: 'reserved', label: 'Reserved' }, { value: 'sold', label: 'Sold' },
      ] },
      { name: 'buyerName', label: 'Buyer name', value: v.buyerName },
      { name: 'buyerPhone', label: 'Buyer phone', value: v.buyerPhone },
      { name: 'buyerCnic', label: 'Buyer CNIC', value: v.buyerCnic },
      { name: 'saleDate', label: 'Sale/booking date', type: 'date', value: v.saleDate },
      { name: 'notes', label: 'Notes', type: 'textarea', value: v.notes },
    ];
  }

  document.getElementById('add-plot-btn').addEventListener('click', () => {
    openFormModal({
      title: 'Add Plot',
      submitLabel: 'Add Plot',
      fields: plotFields(),
      onSubmit: async (values) => {
        await apiRequest(`/colonies/${colonyId}/plots`, { method: 'POST', body: values });
        load();
      },
    });
  });

  document.getElementById('plots-body').addEventListener('click', (e) => {
    const payBtn = e.target.closest('[data-pay]');
    const editBtn = e.target.closest('[data-edit-plot]');
    const delBtn = e.target.closest('[data-delete-plot]');
    if (payBtn) openPlotPaymentsModal(payBtn.dataset.pay);
    if (editBtn) {
      const plot = state.colony.plots.find((p) => p.id === editBtn.dataset.editPlot);
      openFormModal({
        title: `Edit Plot ${plot.plotNumber}`,
        submitLabel: 'Save Changes',
        fields: plotFields(plot),
        onSubmit: async (values) => {
          await apiRequest(`/plots/${plot.id}`, { method: 'PUT', body: values });
          load();
        },
      });
    }
    if (delBtn) {
      if (!confirm('Delete this plot and all of its payment history?')) return;
      apiRequest(`/plots/${delBtn.dataset.deletePlot}`, { method: 'DELETE' }).then(load).catch((err) => showBanner(err.message));
    }
  });

  function paymentsModalHtml(plot) {
    const rows = plot.payments.length ? plot.payments.map((p) => `
      <tr>
        <td class="text-right num">${formatCurrency(p.amount)}</td>
        <td>${formatDate(p.dueDate)}</td>
        <td>${p.paidDate ? formatDate(p.paidDate) : '<span class="badge badge-warning">Pending</span>'}</td>
        <td class="text-muted">${escapeHtml(p.notes || '')}</td>
        <td>
          <div class="row-actions">
            ${!p.paidDate ? `<button type="button" class="btn btn-sm btn-ghost" data-mark-paid="${p.id}">Mark Paid</button>` : ''}
            <button type="button" class="btn btn-sm btn-danger" data-delete-payment="${p.id}">Delete</button>
          </div>
        </td>
      </tr>
    `).join('') : '<tr class="empty-row"><td colspan="5">No payments recorded yet.</td></tr>';

    return `
      <div class="table-wrap" style="margin-bottom:18px;">
        <table>
          <thead><tr><th class="text-right">Amount</th><th>Due date</th><th>Paid date</th><th>Notes</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <form id="add-payment-form">
        <div class="field-grid">
          <label class="field"><span>Amount (Rs.)</span><input type="number" step="0.01" name="amount" required /></label>
          <label class="field"><span>Due date (if promised for later)</span><input type="date" name="dueDate" /></label>
          <label class="field"><span>Paid date (leave blank if not received yet)</span><input type="date" name="paidDate" /></label>
          <label class="field field-wide"><span>Notes</span><input type="text" name="notes" placeholder="e.g. 2nd installment" /></label>
        </div>
        <div class="modal-error" id="payment-form-error" hidden></div>
        <div class="modal-actions"><button type="submit" class="btn btn-primary">Add Payment</button></div>
      </form>
    `;
  }

  function openPlotPaymentsModal(plotId) {
    const plot = state.colony.plots.find((p) => p.id === plotId);
    if (!plot) return;
    openCustomModal(`Payments — Plot ${plot.plotNumber}`, paymentsModalHtml(plot), (root) => {
      root.querySelector('#add-payment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const errBox = root.querySelector('#payment-form-error');
        try {
          await apiRequest(`/plots/${plotId}/payments`, {
            method: 'POST',
            body: {
              amount: form.elements.amount.value,
              dueDate: form.elements.dueDate.value,
              paidDate: form.elements.paidDate.value,
              notes: form.elements.notes.value,
            },
          });
          await load();
          openPlotPaymentsModal(plotId);
        } catch (err) {
          errBox.textContent = err.message;
          errBox.hidden = false;
        }
      });
      root.querySelectorAll('[data-mark-paid]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await apiRequest(`/plot-payments/${btn.dataset.markPaid}`, { method: 'PUT', body: { paidDate: today() } });
            await load();
            openPlotPaymentsModal(plotId);
          } catch (err) { showBanner(err.message); }
        });
      });
      root.querySelectorAll('[data-delete-payment]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this payment record?')) return;
          try {
            await apiRequest(`/plot-payments/${btn.dataset.deletePayment}`, { method: 'DELETE' });
            await load();
            openPlotPaymentsModal(plotId);
          } catch (err) { showBanner(err.message); }
        });
      });
    });
  }

  // ---- Milestones ----

  function renderMilestones(milestones) {
    const body = document.getElementById('milestones-body');
    if (!milestones.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="5">No development milestones added yet.</td></tr>';
      return;
    }
    body.innerHTML = milestones.map((m) => `
      <tr>
        <td style="font-weight:600;">${escapeHtml(m.title)}</td>
        <td>${formatDate(m.dueDate)}</td>
        <td>${statusBadge(m.status)}${m.status === 'completed' && m.completedDate ? `<div class="text-muted" style="font-size:11px;">on ${formatDate(m.completedDate)}</div>` : ''}</td>
        <td class="text-muted">${escapeHtml(m.notes || '—')}</td>
        <td>
          <div class="row-actions">
            ${m.status !== 'completed' ? `<button class="btn btn-ghost btn-sm" data-complete-milestone="${m.id}">Mark Done</button>` : ''}
            <button class="btn btn-ghost btn-sm" data-edit-milestone="${m.id}">Edit</button>
            <button class="btn btn-danger btn-sm" data-delete-milestone="${m.id}">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  document.getElementById('add-milestone-btn').addEventListener('click', () => {
    openFormModal({
      title: 'Add Development Milestone',
      submitLabel: 'Add',
      fields: [
        { name: 'title', label: 'Task', required: true, placeholder: 'e.g. Road carpeting, sewerage line' },
        { name: 'dueDate', label: 'Target date', type: 'date' },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
      onSubmit: async (values) => {
        await apiRequest(`/colonies/${colonyId}/milestones`, { method: 'POST', body: values });
        load();
      },
    });
  });

  document.getElementById('milestones-body').addEventListener('click', (e) => {
    const doneBtn = e.target.closest('[data-complete-milestone]');
    const editBtn = e.target.closest('[data-edit-milestone]');
    const delBtn = e.target.closest('[data-delete-milestone]');
    if (doneBtn) {
      apiRequest(`/milestones/${doneBtn.dataset.completeMilestone}`, { method: 'PUT', body: { status: 'completed', completedDate: today() } }).then(load).catch((err) => showBanner(err.message));
    }
    if (editBtn) {
      const m = state.colony.milestones.find((x) => x.id === editBtn.dataset.editMilestone);
      openFormModal({
        title: 'Edit Milestone',
        submitLabel: 'Save',
        fields: [
          { name: 'title', label: 'Task', required: true, value: m.title },
          { name: 'dueDate', label: 'Target date', type: 'date', value: m.dueDate },
          { name: 'status', label: 'Status', type: 'select', value: m.status, options: [
            { value: 'pending', label: 'Pending' }, { value: 'completed', label: 'Completed' },
          ] },
          { name: 'notes', label: 'Notes', type: 'textarea', value: m.notes },
        ],
        onSubmit: async (values) => {
          await apiRequest(`/milestones/${m.id}`, { method: 'PUT', body: values });
          load();
        },
      });
    }
    if (delBtn) {
      if (!confirm('Delete this milestone?')) return;
      apiRequest(`/milestones/${delBtn.dataset.deleteMilestone}`, { method: 'DELETE' }).then(load).catch((err) => showBanner(err.message));
    }
  });

  // ---- Expenses ----

  function renderExpenses(expenses) {
    const body = document.getElementById('expenses-body');
    if (!expenses.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="6">No expenses recorded yet.</td></tr>';
      return;
    }
    body.innerHTML = expenses.map((ex) => `
      <tr>
        <td style="font-weight:600;">${escapeHtml(ex.title)}</td>
        <td>${escapeHtml(ex.category || '—')}</td>
        <td class="text-right num">${formatCurrency(ex.amount)}</td>
        <td>${formatDate(ex.dueDate)}</td>
        <td>${ex.paidDate ? formatDate(ex.paidDate) : '<span class="badge badge-warning">Pending</span>'}</td>
        <td>
          <div class="row-actions">
            ${!ex.paidDate ? `<button class="btn btn-ghost btn-sm" data-pay-expense="${ex.id}">Mark Paid</button>` : ''}
            <button class="btn btn-ghost btn-sm" data-edit-expense="${ex.id}">Edit</button>
            <button class="btn btn-danger btn-sm" data-delete-expense="${ex.id}">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function expenseFields(ex) {
    const v = ex || {};
    return [
      { name: 'title', label: 'Title', required: true, value: v.title },
      { name: 'category', label: 'Category', type: 'select', value: v.category || 'development', options: [
        { value: 'development', label: 'Development' }, { value: 'legal', label: 'Legal / Documentation' },
        { value: 'marketing', label: 'Marketing' }, { value: 'other', label: 'Other' },
      ] },
      { name: 'amount', label: 'Amount (Rs.)', type: 'number', step: '0.01', required: true, value: v.amount },
      { name: 'dueDate', label: 'Due date', type: 'date', value: v.dueDate },
      { name: 'paidDate', label: 'Paid date (leave blank if not paid yet)', type: 'date', value: v.paidDate },
      { name: 'notes', label: 'Notes', type: 'textarea', value: v.notes },
    ];
  }

  document.getElementById('add-expense-btn').addEventListener('click', () => {
    openFormModal({
      title: 'Add Development Expense',
      submitLabel: 'Add',
      fields: expenseFields(),
      onSubmit: async (values) => {
        await apiRequest(`/colonies/${colonyId}/expenses`, { method: 'POST', body: values });
        load();
      },
    });
  });

  document.getElementById('expenses-body').addEventListener('click', (e) => {
    const payBtn = e.target.closest('[data-pay-expense]');
    const editBtn = e.target.closest('[data-edit-expense]');
    const delBtn = e.target.closest('[data-delete-expense]');
    if (payBtn) {
      apiRequest(`/expenses/${payBtn.dataset.payExpense}`, { method: 'PUT', body: { paidDate: today() } }).then(load).catch((err) => showBanner(err.message));
    }
    if (editBtn) {
      const ex = state.colony.expenses.find((x) => x.id === editBtn.dataset.editExpense);
      openFormModal({
        title: 'Edit Expense',
        submitLabel: 'Save',
        fields: expenseFields(ex),
        onSubmit: async (values) => {
          await apiRequest(`/expenses/${ex.id}`, { method: 'PUT', body: values });
          load();
        },
      });
    }
    if (delBtn) {
      if (!confirm('Delete this expense?')) return;
      apiRequest(`/expenses/${delBtn.dataset.deleteExpense}`, { method: 'DELETE' }).then(load).catch((err) => showBanner(err.message));
    }
  });

  // ---- Colony header actions ----

  document.getElementById('edit-colony-btn').addEventListener('click', () => {
    const c = state.colony;
    openFormModal({
      title: 'Edit Colony',
      submitLabel: 'Save',
      fields: [
        { name: 'name', label: 'Colony name', required: true, value: c.name },
        { name: 'location', label: 'Location', value: c.location },
        { name: 'acquisitionCost', label: 'Land acquisition / development cost (Rs.)', type: 'number', step: '0.01', value: c.acquisitionCost },
        { name: 'description', label: 'Description / notes', type: 'textarea', value: c.description },
      ],
      onSubmit: async (values) => {
        await apiRequest(`/colonies/${colonyId}`, { method: 'PUT', body: values });
        load();
      },
    });
  });

  document.getElementById('delete-colony-btn').addEventListener('click', async () => {
    if (!confirm('Delete this entire colony, including all plots, payments, milestones and expenses? This cannot be undone.')) return;
    try {
      await apiRequest(`/colonies/${colonyId}`, { method: 'DELETE' });
      window.location.href = 'colonies.html';
    } catch (err) {
      showBanner(err.message);
    }
  });

  load();
})();
