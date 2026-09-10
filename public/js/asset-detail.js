(async function () {
  const TYPE_CONFIG = {
    agricultural: { apiBase: '/agricultural', navHref: 'agricultural.html', entityNoun: 'Agricultural Land', buyerNoun: 'Buyer' },
    shops: { apiBase: '/shops', navHref: 'shops.html', entityNoun: 'Shop', buyerNoun: 'Buyer' },
    commercial: { apiBase: '/commercial', navHref: 'commercial.html', entityNoun: 'Commercial Land/Plot', buyerNoun: 'Buyer' },
  };

  const params = new URLSearchParams(window.location.search);
  const type = params.get('type');
  const id = params.get('id');
  const config = TYPE_CONFIG[type];
  if (!config || !id) {
    document.body.innerHTML = '<p style="padding:40px;">No record specified. <a href="index.html">Back to Dashboard</a></p>';
    return;
  }

  const session = await initShell(config.navHref);
  if (!session) return;
  document.getElementById('back-link').href = config.navHref;

  const state = { entity: null };
  const today = () => new Date().toISOString().slice(0, 10);

  document.getElementById('entity-tiles').innerHTML = skeletonCards(4);
  document.getElementById('payments-body').innerHTML = skeletonRows(3, 7);

  async function load() {
    try {
      state.entity = await apiRequest(`${config.apiBase}/${id}`);
      renderAll();
    } catch (err) {
      showBanner(err.message);
    }
  }

  function renderAll() {
    const r = state.entity;
    const s = r.stats;
    setPageTitle(r.title);
    document.getElementById('entity-name').textContent = r.title;
    document.getElementById('entity-meta').innerHTML = `${escapeHtml(r.location || 'No location set')} ${statusBadge(r.status)}`;
    document.getElementById('mark-sold-btn').hidden = r.status === 'sold';

    const tiles = [
      { label: 'Purchase Price', value: r.purchasePrice, sub: r.purchaseDate ? `Purchased ${formatDate(r.purchaseDate)}` : '', accent: '' },
      { label: 'Paid to Seller', value: s.totalPaid, sub: '', accent: 'accent-danger' },
      { label: 'Still Payable', value: s.totalPayable, sub: 'Still owed to the seller', accent: s.totalPayable > 0 ? 'accent-danger' : '' },
    ];
    if (r.status === 'sold') {
      tiles.push({ label: 'Profit', value: s.profit, sub: 'Sale price − purchase price', accent: s.profit >= 0 ? 'accent-success' : 'accent-danger' });
    } else {
      tiles.push({ label: 'Sale Status', value: 'Not sold yet', sub: '', accent: '' });
    }
    document.getElementById('entity-tiles').innerHTML = tiles.map((t, i) => {
      const isNumber = typeof t.value === 'number';
      const valueHtml = isNumber ? `<span class="value" data-countup="${t.value}">Rs. 0</span>` : `<span class="value">${escapeHtml(t.value)}</span>`;
      return `<div class="card stat-tile ${t.accent} entrance" style="animation-delay:${i * 55}ms"><span class="label">${escapeHtml(t.label)}</span>${valueHtml}${t.sub ? `<span class="sub">${escapeHtml(t.sub)}</span>` : ''}</div>`;
    }).join('');
    document.querySelectorAll('#entity-tiles [data-countup]').forEach((el) => animateCountUp(el, Number(el.dataset.countup), { duration: 650 }));

    const saleCard = r.status === 'sold' ? `
      <div class="card entrance" style="animation-delay:320ms;">
        <div style="font-weight:700; margin-bottom:10px;">${escapeHtml(config.buyerNoun)}</div>
        <div style="font-size:13px; line-height:1.9;">
          <div>${escapeHtml(r.buyerName || 'Not set')}</div>
          ${r.buyerPhone ? `<div class="text-muted">${escapeHtml(r.buyerPhone)}</div>` : ''}
          <div class="text-muted">Sale price: ${formatCurrency(r.salePrice)}</div>
          <div class="text-muted">Received so far: ${formatCurrency(s.totalReceived)}</div>
          <div class="text-muted">Still receivable: ${formatCurrency(s.totalReceivable)}</div>
          ${r.saleDate ? `<div class="text-muted">Sale date: ${formatDate(r.saleDate)}</div>` : ''}
        </div>
      </div>` : `
      <div class="card entrance" style="animation-delay:320ms;">
        <div style="font-weight:700; margin-bottom:10px;">Seller</div>
        <div style="font-size:13px; line-height:1.9;">
          <div>${escapeHtml(r.sellerName || 'Not set')}</div>
          ${r.sellerPhone ? `<div class="text-muted">${escapeHtml(r.sellerPhone)}</div>` : ''}
        </div>
      </div>`;

    document.getElementById('entity-info-cards').innerHTML = `
      <div class="card entrance" style="animation-delay:260ms;">
        <div style="font-weight:700; margin-bottom:10px;">Dimensions &amp; Area</div>
        <div style="font-size:13px; line-height:1.9;">
          <div>Area / size: ${escapeHtml(r.area || '—')}</div>
          <div>Front: ${r.frontFt ? `${r.frontFt} ft` : '<span class="text-muted">Not set</span>'}</div>
          <div>Length / Depth: ${r.lengthFt ? `${r.lengthFt} ft` : '<span class="text-muted">Not set</span>'}</div>
          ${r.notes ? `<div class="text-muted" style="margin-top:6px;">${escapeHtml(r.notes)}</div>` : ''}
        </div>
      </div>
      ${saleCard}
    `;

    renderPayments(r.payments || []);
  }

  function renderPayments(payments) {
    const body = document.getElementById('payments-body');
    if (!payments.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="7">No payments recorded yet.</td></tr>';
      return;
    }
    const sorted = payments.slice().sort((a, b) => new Date(b.dueDate || b.paidDate || 0) - new Date(a.dueDate || a.paidDate || 0));
    body.innerHTML = sorted.map((p) => `
      <tr>
        <td>${p.direction === 'paid' ? `<span class="badge badge-danger">Paid to seller</span>` : `<span class="badge badge-success">Received from buyer</span>`}</td>
        <td class="text-right num" style="font-weight:600; color:${p.direction === 'paid' ? 'var(--danger)' : 'var(--success)'};">${formatCurrency(p.amount)}</td>
        <td>${formatDate(p.dueDate)}</td>
        <td>${p.paidDate ? formatDate(p.paidDate) : '<span class="badge badge-warning">Pending</span>'}</td>
        <td class="text-muted" style="font-size:12px;">${escapeHtml(paymentMethodLabel(p)) || '—'}</td>
        <td class="text-muted">${escapeHtml(p.notes || '')}</td>
        <td>
          <div class="row-actions">
            <button type="button" class="btn btn-sm btn-ghost" data-print="${p.id}">🖨 Print</button>
            ${!p.paidDate ? `<button type="button" class="btn btn-sm btn-ghost" data-mark-paid="${p.id}">Mark Done</button>` : ''}
            <button type="button" class="btn btn-sm btn-danger" data-delete-payment="${p.id}">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
    staggerRows(body, { stepMs: 30, maxDelayMs: 240 });
  }

  document.getElementById('payments-body').addEventListener('click', (e) => {
    const printBtn = e.target.closest('[data-print]');
    const markBtn = e.target.closest('[data-mark-paid]');
    const delBtn = e.target.closest('[data-delete-payment]');
    if (printBtn) {
      const url = `receipt.html?apiBase=${encodeURIComponent(config.apiBase)}&entityId=${encodeURIComponent(id)}&paymentId=${encodeURIComponent(printBtn.dataset.print)}`;
      window.open(url, '_blank');
    }
    if (markBtn) {
      const payment = (state.entity.payments || []).find((p) => p.id === markBtn.dataset.markPaid);
      openSettlePaymentModal({
        title: 'Mark Payment Settled',
        defaultDate: (payment && payment.dueDate) || today(),
        onCancel: load,
        onConfirm: async ({ paidDate, paidThrough, referenceNumber, bankName }) => {
          await apiRequest(`${config.apiBase}/payments/${markBtn.dataset.markPaid}`, {
            method: 'PUT',
            body: { paidDate, paidThrough, referenceNumber, bankName },
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
          await apiRequest(`${config.apiBase}/payments/${delBtn.dataset.deletePayment}`, { method: 'DELETE' });
          await load();
        } catch (err) { showBanner(err.message); }
      })();
    }
  });

  document.getElementById('add-payment-btn').addEventListener('click', () => {
    openCustomModal('Add Payment', `
      <form id="add-payment-form">
        <div class="field-grid">
          <label class="field">
            <span>Type</span>
            <select name="direction" required>
              <option value="paid">Paid to seller (money out)</option>
              <option value="received">Received from buyer (money in)</option>
            </select>
          </label>
          <label class="field"><span>Amount (Rs.)</span><input type="number" step="0.01" name="amount" required /></label>
          <label class="field"><span>Due date (if promised for later)</span><input type="date" name="dueDate" /></label>
          <label class="field"><span>Settled date (leave blank if pending)</span><input type="date" name="paidDate" /></label>
          ${paymentMethodFieldsHtml()}
          <label class="field field-wide"><span>Notes</span><input type="text" name="notes" /></label>
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
          await apiRequest(`${config.apiBase}/${id}/payments`, {
            method: 'POST',
            body: {
              direction: form.elements.direction.value,
              amount: form.elements.amount.value,
              dueDate: form.elements.dueDate.value,
              paidDate: form.elements.paidDate.value,
              paidThrough: form.elements.paidThrough.value,
              referenceNumber: form.elements.referenceNumber.value,
              bankName: form.elements.bankName.value,
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
    openCustomModal('Create Installment Plan', `<form id="plan-form">${installmentPlanFormHtml({ includeDirection: true })}</form>`, (root) => {
      initInstallmentPlanRows(root);
      root.querySelector('[data-plan-cancel]').addEventListener('click', closeModal);
      root.querySelector('#plan-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errBox = root.querySelector('#plan-error');
        const submitBtn = root.querySelector('[data-plan-submit]');
        const direction = root.querySelector('[name=planDirection]').value;
        const { upfrontAmount, upfrontDate, upfrontPaidThrough, upfrontReferenceNumber, upfrontBankName, installments } = collectInstallmentPlan(root);
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
            await apiRequest(`${config.apiBase}/${id}/payments`, {
              method: 'POST',
              body: {
                direction, amount: upfrontAmount, paidDate: upfrontDate, notes: 'Upfront / Bayana',
                paidThrough: upfrontPaidThrough, referenceNumber: upfrontReferenceNumber, bankName: upfrontBankName,
              },
            });
          }
          for (const row of installments) {
            await apiRequest(`${config.apiBase}/${id}/payments`, {
              method: 'POST',
              body: { direction, amount: row.amount, dueDate: row.dueDate, notes: 'Installment' },
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

  // ---- Header actions ----

  function entityFields(row) {
    const v = row || {};
    return [
      { name: 'title', label: `${config.entityNoun} title / identifier`, required: true, value: v.title },
      { name: 'location', label: 'Location', value: v.location },
      { name: 'area', label: 'Area / size', value: v.area },
      { name: 'frontFt', label: 'Front (feet)', type: 'number', step: '0.01', value: v.frontFt != null ? v.frontFt : 0 },
      { name: 'lengthFt', label: 'Length / Depth (feet)', type: 'number', step: '0.01', value: v.lengthFt != null ? v.lengthFt : 0 },
      { name: 'purchasePrice', label: 'Purchase price (Rs.)', type: 'number', step: '0.01', value: v.purchasePrice != null ? v.purchasePrice : 0 },
      { name: 'purchaseDate', label: 'Purchase date', type: 'date', value: v.purchaseDate },
      { name: 'sellerName', label: 'Seller name', value: v.sellerName },
      { name: 'sellerPhone', label: 'Seller phone', value: v.sellerPhone },
      { name: 'notes', label: 'Notes', type: 'textarea', value: v.notes },
    ];
  }

  document.getElementById('edit-entity-btn').addEventListener('click', () => {
    openFormModal({
      title: `Edit ${config.entityNoun}`,
      submitLabel: 'Save',
      fields: entityFields(state.entity),
      onSubmit: async (values) => {
        await apiRequest(`${config.apiBase}/${id}`, { method: 'PUT', body: values });
        load();
      },
    });
  });

  document.getElementById('mark-sold-btn').addEventListener('click', () => {
    const row = state.entity;
    openFormModal({
      title: `Mark ${config.entityNoun} as Sold`,
      submitLabel: 'Save',
      fields: [
        { name: 'salePrice', label: 'Sale price (Rs.)', type: 'number', step: '0.01', required: true, value: row.purchasePrice },
        { name: 'saleDate', label: 'Sale date', type: 'date', value: today() },
        { name: 'buyerName', label: `${config.buyerNoun} name`, required: true },
        { name: 'buyerPhone', label: `${config.buyerNoun} phone` },
      ],
      onSubmit: async (values) => {
        values.status = 'sold';
        await apiRequest(`${config.apiBase}/${id}`, { method: 'PUT', body: values });
        load();
      },
    });
  });

  document.getElementById('delete-entity-btn').addEventListener('click', withButtonBusy(document.getElementById('delete-entity-btn'), async () => {
    if (!confirm(`Delete this ${config.entityNoun.toLowerCase()} record and its payment history? This cannot be undone.`)) return;
    try {
      await apiRequest(`${config.apiBase}/${id}`, { method: 'DELETE' });
      window.location.href = config.navHref;
    } catch (err) {
      showBanner(err.message);
    }
  }));

  load();
})();
