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

  document.getElementById('colony-tiles').innerHTML = skeletonCards(8);
  document.getElementById('plots-body').innerHTML = skeletonRows(3, 10);
  document.getElementById('milestones-body').innerHTML = skeletonRows(2, 5);
  document.getElementById('expenses-body').innerHTML = skeletonRows(2, 6);

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

  function tile(label, value, sub, accent, i) {
    const isNumber = typeof value === 'number';
    const valueHtml = isNumber ? `<span class="value" data-countup="${value}">Rs. 0</span>` : `<span class="value">${value}</span>`;
    return `<div class="card stat-tile ${accent || ''} entrance" style="animation-delay:${i * 55}ms"><span class="label">${label}</span>${valueHtml}${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
  }

  function renderTiles(s) {
    const tiles = [
      tile('Plots Sold', `${s.sold}/${s.totalPlots}`, `${s.percentSold}% sold · ${s.reserved} reserved · ${s.available} available`, '', 0),
      tile('Total Received', s.totalReceived, 'From buyers so far', 'accent-success', 1),
      tile('Total Receivable', s.totalReceivable, 'Still owed by buyers', 'accent-info', 2),
      tile('Projected Profit', s.projectedProfit, 'Sale value − cost − all expenses', s.projectedProfit >= 0 ? 'accent-success' : 'accent-danger', 3),
      tile('Acquisition / Dev. Cost', s.acquisitionCost, 'Cost of the raw colony land', '', 4),
      tile('Expenses Paid', s.totalExpensesPaid, 'Development spend so far', 'accent-danger', 5),
      tile('Expenses Pending', s.totalExpensesPending, 'Planned but not yet paid', '', 6),
      tile('Cash Profit (so far)', s.cashProfit, 'Received − cost − expenses paid', s.cashProfit >= 0 ? 'accent-success' : 'accent-danger', 7),
    ];
    const container = document.getElementById('colony-tiles');
    container.innerHTML = tiles.join('');
    container.querySelectorAll('[data-countup]').forEach((el) => animateCountUp(el, Number(el.dataset.countup), { duration: 650 }));
  }

  // ---- Plots ----

  const STANDARD_SIZES = ['3 Marla', '4 Marla', '5 Marla', '7 Marla', '10 Marla'];
  const OTHER_SIZE = 'Other (specify below)';

  const CATEGORY_LABELS = { residential: 'Residential', commercial: 'Commercial', shop: 'Shop' };

  // The earliest payment that's promised but not yet paid - the plot's
  // "next payment schedule" entry, shown right in the plots table.
  function nextDueOf(payments) {
    const pending = (payments || []).filter((p) => !p.paidDate && p.dueDate && p.status !== 'rescheduled');
    if (!pending.length) return null;
    pending.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    const next = pending[0];
    return Object.assign({}, next, { overdue: new Date(next.dueDate) < new Date(today()) });
  }

  function renderPlots(plots) {
    const body = document.getElementById('plots-body');
    if (!plots.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="10">No plots added yet.</td></tr>';
      return;
    }
    body.innerHTML = plots.map((p) => {
      const due = nextDueOf(p.payments);
      const dueCell = due
        ? `${formatCurrency(due.amount)}<div style="font-size:11px; ${due.overdue ? 'color:var(--danger); font-weight:700;' : 'color:var(--text-muted);'}">${formatDate(due.dueDate)}${due.overdue ? ' · OVERDUE' : ''}</div>`
        : '<span class="text-muted">—</span>';
      return `
      <tr>
        <td style="font-weight:700;">${escapeHtml(p.plotNumber)}</td>
        <td>${escapeHtml(p.size || '—')}</td>
        <td style="text-transform:capitalize;">${escapeHtml(CATEGORY_LABELS[p.category] || p.category || '—')}</td>
        <td>${statusBadge(p.status)}</td>
        <td>${escapeHtml(p.buyerName || '—')}${p.buyerPhone ? `<div class="text-muted" style="font-size:11px;">${escapeHtml(p.buyerPhone)}</div>` : ''}</td>
        <td class="text-right num">${formatCurrency(p.price)}</td>
        <td class="text-right num" style="color:var(--success);">${formatCurrency(p.received)}</td>
        <td class="text-right num" style="color:${p.remaining > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${formatCurrency(p.remaining)}</td>
        <td class="num">${dueCell}</td>
        <td>
          <div class="row-actions">
            <a class="btn btn-ghost btn-sm" href="plot.html?colonyId=${encodeURIComponent(colonyId)}&plotId=${p.id}">Open</a>
            <button class="btn btn-ghost btn-sm" data-edit-plot="${p.id}">Edit</button>
            <button class="btn btn-danger btn-sm" data-delete-plot="${p.id}">Delete</button>
          </div>
        </td>
      </tr>
    `;
    }).join('');
    staggerRows(body, { stepMs: 35 });
  }

  function plotFields(plot) {
    const v = plot || {};
    const hasStandardSize = STANDARD_SIZES.includes(v.size);
    return [
      { name: 'plotNumber', label: 'Plot number', required: true, value: v.plotNumber },
      { name: 'size', label: 'Plot size', type: 'select', value: v.size && !hasStandardSize ? OTHER_SIZE : (v.size || STANDARD_SIZES[0]), options: [
        ...STANDARD_SIZES.map((s) => ({ value: s, label: s })),
        { value: OTHER_SIZE, label: OTHER_SIZE },
      ] },
      { name: 'sizeCustom', label: 'Custom size (only used if "Other" is selected above)', value: v.size && !hasStandardSize ? v.size : '', placeholder: 'e.g. 8 Marla, 2 Kanal' },
      { name: 'category', label: 'Category', type: 'select', value: v.category || 'residential', options: [
        { value: 'residential', label: 'Residential' }, { value: 'commercial', label: 'Commercial' }, { value: 'shop', label: 'Shop' },
      ] },
      { name: 'frontFt', label: 'Front (feet)', type: 'number', step: '0.01', value: v.frontFt != null ? v.frontFt : 0 },
      { name: 'lengthFt', label: 'Length / Depth (feet)', type: 'number', step: '0.01', value: v.lengthFt != null ? v.lengthFt : 0 },
      { name: 'price', label: 'Sale price (Rs.)', type: 'number', step: '0.01', value: v.price != null ? v.price : 0 },
      { name: 'status', label: 'Status', type: 'select', value: v.status || 'available', options: [
        { value: 'available', label: 'Available' }, { value: 'reserved', label: 'Reserved' }, { value: 'sold', label: 'Sold' },
      ] },
      { name: 'buyerName', label: 'Owner / Buyer name', value: v.buyerName },
      { name: 'buyerPhone', label: 'Owner / Buyer phone', value: v.buyerPhone },
      { name: 'buyerCnic', label: 'Owner / Buyer CNIC', value: v.buyerCnic },
      { name: 'saleDate', label: 'Sale/booking date', type: 'date', value: v.saleDate },
      { name: 'notes', label: 'Notes', type: 'textarea', value: v.notes },
    ];
  }

  // Resolves the select+custom-text pair down to the single "size" string
  // the backend actually stores, and drops the helper field.
  function resolvePlotSize(values) {
    const resolved = Object.assign({}, values);
    if (resolved.size === OTHER_SIZE) {
      resolved.size = (resolved.sizeCustom || '').trim() || OTHER_SIZE;
    }
    delete resolved.sizeCustom;
    return resolved;
  }

  document.getElementById('add-plot-btn').addEventListener('click', () => {
    openFormModal({
      title: 'Add Plot',
      submitLabel: 'Add Plot',
      fields: plotFields(),
      onSubmit: async (values) => {
        await apiRequest(`/colonies/${colonyId}/plots`, { method: 'POST', body: resolvePlotSize(values) });
        load();
      },
    });
  });

  document.getElementById('plots-body').addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-plot]');
    const delBtn = e.target.closest('[data-delete-plot]');
    if (editBtn) {
      const plot = state.colony.plots.find((p) => p.id === editBtn.dataset.editPlot);
      openFormModal({
        title: `Edit Plot ${plot.plotNumber}`,
        submitLabel: 'Save Changes',
        fields: plotFields(plot),
        onSubmit: async (values) => {
          await apiRequest(`/plots/${plot.id}`, { method: 'PUT', body: resolvePlotSize(values) });
          load();
        },
      });
    }
    if (delBtn) {
      withButtonBusy(delBtn, async () => {
        if (!confirm('Delete this plot and all of its payment history?')) return;
        try {
          await apiRequest(`/plots/${delBtn.dataset.deletePlot}`, { method: 'DELETE' });
          load();
        } catch (err) { showBanner(err.message); }
      })();
    }
  });

  // Payments, the installment plan builder, and printing a receipt all now
  // live on the plot's own dedicated page (plot.html) reached via "Open"
  // above, instead of a modal here - see plot.js.

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
    staggerRows(body, { stepMs: 35 });
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
      withButtonBusy(doneBtn, async () => {
        try {
          await apiRequest(`/milestones/${doneBtn.dataset.completeMilestone}`, { method: 'PUT', body: { status: 'completed', completedDate: today() } });
          load();
        } catch (err) { showBanner(err.message); }
      })();
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
      withButtonBusy(delBtn, async () => {
        if (!confirm('Delete this milestone?')) return;
        try {
          await apiRequest(`/milestones/${delBtn.dataset.deleteMilestone}`, { method: 'DELETE' });
          load();
        } catch (err) { showBanner(err.message); }
      })();
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
        <td class="text-right num" style="color:var(--danger);">${formatCurrency(ex.amount)}</td>
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
    staggerRows(body, { stepMs: 35 });
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
      withButtonBusy(payBtn, async () => {
        try {
          await apiRequest(`/expenses/${payBtn.dataset.payExpense}`, { method: 'PUT', body: { paidDate: today() } });
          load();
        } catch (err) { showBanner(err.message); }
      })();
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
      withButtonBusy(delBtn, async () => {
        if (!confirm('Delete this expense?')) return;
        try {
          await apiRequest(`/expenses/${delBtn.dataset.deleteExpense}`, { method: 'DELETE' });
          load();
        } catch (err) { showBanner(err.message); }
      })();
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

  document.getElementById('delete-colony-btn').addEventListener('click', withButtonBusy(document.getElementById('delete-colony-btn'), async () => {
    if (!confirm('Delete this entire colony, including all plots, payments, milestones and expenses? This cannot be undone.')) return;
    try {
      await apiRequest(`/colonies/${colonyId}`, { method: 'DELETE' });
      window.location.href = 'colonies.html';
    } catch (err) {
      showBanner(err.message);
    }
  }));

  load();
})();
