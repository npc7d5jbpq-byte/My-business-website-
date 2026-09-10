(async function () {
  const session = await initShell('colonies.html');
  if (!session) return;

  const params = new URLSearchParams(window.location.search);
  const colonyId = params.get('colonyId');
  const plotId = params.get('plotId');
  if (!colonyId || !plotId) {
    document.body.innerHTML = '<p style="padding:40px;">No plot specified. <a href="colonies.html">Back to Colonies</a></p>';
    return;
  }
  document.getElementById('back-link').href = `colony.html?id=${encodeURIComponent(colonyId)}`;

  const STANDARD_SIZES = ['3 Marla', '4 Marla', '5 Marla', '7 Marla', '10 Marla'];
  const OTHER_SIZE = 'Other (specify below)';
  const CATEGORY_LABELS = { residential: 'Residential', commercial: 'Commercial', shop: 'Shop' };

  const state = { colony: null, plot: null };
  const today = () => new Date().toISOString().slice(0, 10);

  document.getElementById('plot-tiles').innerHTML = skeletonCards(4);
  document.getElementById('payments-body').innerHTML = skeletonRows(3, 6);

  async function load() {
    try {
      state.colony = await apiRequest(`/colonies/${colonyId}`);
      state.plot = state.colony.plots.find((p) => p.id === plotId);
      if (!state.plot) {
        showBanner('That plot could not be found - it may have been deleted.');
        return;
      }
      renderAll();
    } catch (err) {
      showBanner(err.message);
    }
  }

  function nextDueOf(payments) {
    const pending = (payments || []).filter((p) => !p.paidDate && p.dueDate && p.status !== 'rescheduled');
    if (!pending.length) return null;
    pending.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    const next = pending[0];
    return Object.assign({}, next, { overdue: new Date(next.dueDate) < new Date(today()) });
  }

  function renderAll() {
    const p = state.plot;
    setPageTitle(`Plot ${p.plotNumber}`);
    document.getElementById('plot-name').textContent = `Plot ${p.plotNumber}`;
    document.getElementById('plot-meta').textContent = `${state.colony.name}${p.size ? ' · ' + p.size : ''}`;

    const cancelled = p.status === 'cancelled';
    document.getElementById('cancel-sale-btn').hidden = cancelled || !(p.status === 'sold' || p.status === 'reserved');
    document.getElementById('reactivate-plot-btn').hidden = !cancelled;

    const due = nextDueOf(p.payments);
    const tiles = [
      { label: 'Sale Price', value: p.price, sub: '', accent: '' },
      { label: 'Received', value: p.received, sub: 'From the buyer so far', accent: 'accent-success' },
      { label: 'Remaining', value: p.remaining, sub: 'Still owed by the buyer', accent: p.remaining > 0 ? 'accent-danger' : '' },
      { label: 'Next Due', value: due ? due.amount : 0, sub: due ? `${formatDate(due.dueDate)}${due.overdue ? ' · OVERDUE' : ''}` : 'Nothing scheduled', accent: due && due.overdue ? 'accent-danger' : '' },
    ];
    document.getElementById('plot-tiles').innerHTML = tiles.map((t, i) => `
      <div class="card stat-tile ${t.accent} entrance" style="animation-delay:${i * 55}ms">
        <span class="label">${escapeHtml(t.label)}</span>
        <span class="value" data-countup="${t.value}">Rs. 0</span>
        ${t.sub ? `<span class="sub">${escapeHtml(t.sub)}</span>` : ''}
      </div>
    `).join('');
    document.querySelectorAll('#plot-tiles [data-countup]').forEach((el) => animateCountUp(el, Number(el.dataset.countup), { duration: 650 }));

    document.getElementById('plot-info-cards').innerHTML = `
      <div class="card entrance" style="animation-delay:260ms;">
        <div style="font-weight:700; margin-bottom:10px;">Owner / Buyer</div>
        <div style="font-size:13px; line-height:1.9;">
          <div>${escapeHtml(p.buyerName || 'Not set')}</div>
          ${p.buyerPhone ? `<div class="text-muted">${escapeHtml(p.buyerPhone)}</div>` : ''}
          ${p.buyerCnic ? `<div class="text-muted">CNIC: ${escapeHtml(p.buyerCnic)}</div>` : ''}
          <div class="text-muted">Status: ${statusBadge(p.status)}</div>
          ${p.status === 'cancelled' && p.cancelReason ? `<div class="text-muted">Cancelled: ${escapeHtml(p.cancelReason)}</div>` : ''}
          ${p.saleDate ? `<div class="text-muted">Sale/booking date: ${formatDate(p.saleDate)}</div>` : ''}
        </div>
      </div>
      <div class="card entrance" style="animation-delay:320ms;">
        <div style="font-weight:700; margin-bottom:10px;">Dimensions</div>
        <div style="font-size:13px; line-height:1.9;">
          <div>Size: ${escapeHtml(p.size || '—')}</div>
          <div>Category: ${escapeHtml(CATEGORY_LABELS[p.category] || p.category || '—')}</div>
          <div>Front: ${p.frontFt ? `${p.frontFt} ft` : '<span class="text-muted">Not set</span>'}</div>
          <div>Length / Depth: ${p.lengthFt ? `${p.lengthFt} ft` : '<span class="text-muted">Not set</span>'}</div>
          ${p.notes ? `<div class="text-muted" style="margin-top:6px;">${escapeHtml(p.notes)}</div>` : ''}
        </div>
      </div>
    `;

    renderPayments(p.payments);
  }

  function renderPayments(payments) {
    const body = document.getElementById('payments-body');
    if (!payments.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="6">No payments recorded yet.</td></tr>';
      return;
    }
    const sorted = payments.slice().sort((a, b) => new Date(b.dueDate || b.paidDate || 0) - new Date(a.dueDate || a.paidDate || 0));
    body.innerHTML = sorted.map((p) => {
      const rescheduled = p.status === 'rescheduled';
      const settledCell = rescheduled
        ? '<span class="badge badge-muted">Missed — Rescheduled</span>'
        : (p.paidDate ? formatDate(p.paidDate) : '<span class="badge badge-warning">Pending</span>');
      const methodLine = [paymentMethodLabel(p), paidByLabel(p)].filter(Boolean).join('<br>');
      return `
      <tr style="${rescheduled ? 'opacity:0.65;' : ''}">
        <td class="text-right num" style="color:var(--success); font-weight:600;">${formatCurrency(p.amount)}</td>
        <td>${formatDate(p.dueDate)}</td>
        <td>${settledCell}</td>
        <td class="text-muted" style="font-size:12px;">${methodLine || '—'}</td>
        <td class="text-muted">${escapeHtml(p.notes || '')}</td>
        <td>
          <div class="row-actions">
            <button type="button" class="btn btn-sm btn-ghost" data-print="${p.id}">🖨 Print</button>
            ${!p.paidDate && !rescheduled ? `<button type="button" class="btn btn-sm btn-ghost" data-mark-paid="${p.id}">Mark Paid</button>` : ''}
            ${!p.paidDate && !rescheduled ? `<button type="button" class="btn btn-sm btn-ghost" data-reschedule="${p.id}" title="Wasn't given/received on time — set a new date">Reschedule</button>` : ''}
            <button type="button" class="btn btn-sm btn-danger" data-delete-payment="${p.id}">Delete</button>
          </div>
        </td>
      </tr>
    `;
    }).join('');
    staggerRows(body, { stepMs: 30, maxDelayMs: 240 });
  }

  document.getElementById('payments-body').addEventListener('click', (e) => {
    const printBtn = e.target.closest('[data-print]');
    const markBtn = e.target.closest('[data-mark-paid]');
    const rescheduleBtn = e.target.closest('[data-reschedule]');
    const delBtn = e.target.closest('[data-delete-payment]');
    if (printBtn) {
      const url = `receipt.html?apiBase=/colonies&colonyId=${encodeURIComponent(colonyId)}&plotId=${encodeURIComponent(plotId)}&paymentId=${encodeURIComponent(printBtn.dataset.print)}`;
      window.open(url, '_blank');
    }
    if (markBtn) {
      const payment = state.plot.payments.find((p) => p.id === markBtn.dataset.markPaid);
      openSettlePaymentModal({
        title: 'Mark Payment Paid',
        defaultDate: (payment && payment.dueDate) || today(),
        onCancel: load,
        onConfirm: async ({ paidDate, paidThrough, referenceNumber, bankName, paidBy }) => {
          await apiRequest(`/plot-payments/${markBtn.dataset.markPaid}`, {
            method: 'PUT',
            body: { paidDate, paidThrough, referenceNumber, bankName, paidBy },
          });
          closeModal();
          await load();
        },
      });
    }
    if (rescheduleBtn) {
      const payment = state.plot.payments.find((p) => p.id === rescheduleBtn.dataset.reschedule);
      openRescheduleModal({
        title: 'Reschedule Payment',
        originalDueDate: payment && payment.dueDate,
        onCancel: load,
        onConfirm: async ({ newDueDate, reason }) => {
          await apiRequest(`/plot-payments/${rescheduleBtn.dataset.reschedule}`, {
            method: 'PUT',
            body: { status: 'rescheduled', notes: `${payment.notes ? payment.notes + ' — ' : ''}Missed, rescheduled to ${formatDate(newDueDate)}${reason ? ' (' + reason + ')' : ''}` },
          });
          await apiRequest(`/plots/${plotId}/payments`, {
            method: 'POST',
            body: { amount: payment.amount, dueDate: newDueDate, notes: `Rescheduled from ${formatDate(payment.dueDate)}${reason ? ' — ' + reason : ''}` },
          });
          closeModal();
          await load();
        },
      });
    }
    if (delBtn) {
      withButtonBusy(delBtn, async () => {
        if (!confirm('Delete this payment record?')) return;
        try {
          await apiRequest(`/plot-payments/${delBtn.dataset.deletePayment}`, { method: 'DELETE' });
          await load();
        } catch (err) { showBanner(err.message); }
      })();
    }
  });

  document.getElementById('add-payment-btn').addEventListener('click', () => {
    openCustomModal('Add Payment', `
      <form id="add-payment-form">
        <div class="field-grid">
          <label class="field"><span>Amount (Rs.)</span><input type="number" step="0.01" name="amount" required /></label>
          <label class="field"><span>Due date (if promised for later)</span><input type="date" name="dueDate" /></label>
          <label class="field"><span>Paid date (leave blank if not received yet)</span><input type="date" name="paidDate" /></label>
          ${paymentMethodFieldsHtml()}
          <label class="field field-wide"><span>Notes</span><input type="text" name="notes" placeholder="e.g. 2nd installment" /></label>
        </div>
        <div class="modal-error" id="payment-form-error" hidden></div>
        <div class="modal-actions"><button type="submit" class="btn btn-primary" id="add-payment-submit">Add Payment</button></div>
      </form>
    `, (root) => {
      const submitBtn = root.querySelector('#add-payment-submit');
      root.querySelector('#add-payment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const errBox = root.querySelector('#payment-form-error');
        setButtonLoading(submitBtn, true, 'Adding…');
        try {
          await apiRequest(`/plots/${plotId}/payments`, {
            method: 'POST',
            body: {
              amount: form.elements.amount.value,
              dueDate: form.elements.dueDate.value,
              paidDate: form.elements.paidDate.value,
              paidThrough: form.elements.paidThrough.value,
              referenceNumber: form.elements.referenceNumber.value,
              bankName: form.elements.bankName.value,
              paidBy: form.elements.paidBy.value,
              notes: form.elements.notes.value,
            },
          });
          closeModal();
          await load();
        } catch (err) {
          errBox.textContent = err.message;
          errBox.hidden = false;
          setButtonLoading(submitBtn, false);
        }
      });
    });
  });

  document.getElementById('add-plan-btn').addEventListener('click', () => {
    openCustomModal('Create Installment Plan', `<form id="plan-form">${installmentPlanFormHtml({ includeDirection: false })}</form>`, (root) => {
      initInstallmentPlanRows(root);
      root.querySelector('[data-plan-cancel]').addEventListener('click', closeModal);
      root.querySelector('#plan-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errBox = root.querySelector('#plan-error');
        const submitBtn = root.querySelector('[data-plan-submit]');
        const { upfrontAmount, upfrontDate, upfrontPaidThrough, upfrontReferenceNumber, upfrontBankName, upfrontPaidBy, installments } = collectInstallmentPlan(root);
        if (upfrontAmount <= 0 && !installments.length) {
          errBox.textContent = 'Enter an upfront amount and/or at least one installment.';
          errBox.hidden = false;
          return;
        }
        const missingDate = installments.find((row) => !row.dueDate);
        if (missingDate) {
          errBox.textContent = 'Every installment needs a due date (type months-after, or pick a date directly).';
          errBox.hidden = false;
          return;
        }
        errBox.hidden = true;
        setButtonLoading(submitBtn, true, 'Creating…');
        try {
          if (upfrontAmount > 0) {
            await apiRequest(`/plots/${plotId}/payments`, {
              method: 'POST',
              body: {
                amount: upfrontAmount, paidDate: upfrontDate, notes: 'Upfront / Bayana',
                paidThrough: upfrontPaidThrough, referenceNumber: upfrontReferenceNumber, bankName: upfrontBankName, paidBy: upfrontPaidBy,
              },
            });
          }
          for (const row of installments) {
            await apiRequest(`/plots/${plotId}/payments`, {
              method: 'POST',
              body: { amount: row.amount, dueDate: row.dueDate, notes: 'Installment' },
            });
          }
          closeModal();
          await load();
        } catch (err) {
          errBox.textContent = err.message;
          errBox.hidden = false;
          setButtonLoading(submitBtn, false);
        }
      });
    });
  });

  // ---- Plot header actions ----

  const STANDARD = STANDARD_SIZES;
  function plotFields(plot) {
    const v = plot || {};
    const hasStandardSize = STANDARD.includes(v.size);
    return [
      { name: 'plotNumber', label: 'Plot number', required: true, value: v.plotNumber },
      { name: 'size', label: 'Plot size', type: 'select', value: v.size && !hasStandardSize ? OTHER_SIZE : (v.size || STANDARD[0]), options: [
        ...STANDARD.map((s) => ({ value: s, label: s })),
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

  function resolvePlotSize(values) {
    const resolved = Object.assign({}, values);
    if (resolved.size === OTHER_SIZE) {
      resolved.size = (resolved.sizeCustom || '').trim() || OTHER_SIZE;
    }
    delete resolved.sizeCustom;
    return resolved;
  }

  document.getElementById('edit-plot-btn').addEventListener('click', () => {
    openFormModal({
      title: `Edit Plot ${state.plot.plotNumber}`,
      submitLabel: 'Save Changes',
      fields: plotFields(state.plot),
      onSubmit: async (values) => {
        await apiRequest(`/plots/${plotId}`, { method: 'PUT', body: resolvePlotSize(values) });
        load();
      },
    });
  });

  document.getElementById('cancel-sale-btn').addEventListener('click', () => {
    openFormModal({
      title: 'Cancel Sale',
      submitLabel: 'Cancel Sale',
      fields: [
        { name: 'cancelReason', label: 'Reason (optional)', type: 'textarea', placeholder: 'e.g. buyer backed out' },
      ],
      onSubmit: async (values) => {
        await apiRequest(`/plots/${plotId}`, { method: 'PUT', body: { status: 'cancelled', previousStatus: state.plot.status, cancelReason: values.cancelReason } });
        load();
      },
    });
  });

  document.getElementById('reactivate-plot-btn').addEventListener('click', withButtonBusy(document.getElementById('reactivate-plot-btn'), async () => {
    try {
      await apiRequest(`/plots/${plotId}`, { method: 'PUT', body: { status: state.plot.previousStatus || 'sold', previousStatus: '', cancelReason: '' } });
      load();
    } catch (err) { showBanner(err.message); }
  }));

  document.getElementById('delete-plot-btn').addEventListener('click', withButtonBusy(document.getElementById('delete-plot-btn'), async () => {
    if (!confirm('Permanently delete this plot and all of its payment history? This cannot be undone - if you just want to void the sale but keep it on record, use "Cancel Sale" instead.')) return;
    try {
      await apiRequest(`/plots/${plotId}`, { method: 'DELETE' });
      window.location.href = `colony.html?id=${encodeURIComponent(colonyId)}`;
    } catch (err) {
      showBanner(err.message);
    }
  }));

  load();
})();
