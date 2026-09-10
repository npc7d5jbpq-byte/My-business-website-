(async function () {
  const session = await initShell('brokers.html');
  if (!session) return;

  const brokerId = new URLSearchParams(window.location.search).get('id');
  if (!brokerId) {
    document.body.innerHTML = '<p style="padding:40px;">No broker specified. <a href="brokers.html">Back to Brokers</a></p>';
    return;
  }

  const state = { broker: null };
  const today = () => new Date().toISOString().slice(0, 10);

  document.getElementById('broker-tiles').innerHTML = skeletonCards(4);
  document.getElementById('advances-body').innerHTML = skeletonRows(2, 5);
  document.getElementById('deals-body').innerHTML = skeletonRows(3, 7);

  async function load() {
    try {
      state.broker = await apiRequest(`/brokers/${brokerId}`);
      renderAll();
    } catch (err) {
      showBanner(err.message);
    }
  }

  function renderAll() {
    const b = state.broker;
    setPageTitle(b.name);
    document.getElementById('broker-name').textContent = b.name;
    document.getElementById('broker-phone').textContent = b.phone || 'No phone on file';
    renderTiles(b.stats);
    renderAdvances(b.advances, b.stats);
    renderDeals(b.deals);
  }

  function tile(label, value, sub, accent, i) {
    return `<div class="card stat-tile ${accent || ''} entrance" style="animation-delay:${i * 55}ms"><span class="label">${label}</span><span class="value" data-countup="${value}">Rs. 0</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
  }

  function renderTiles(s) {
    const tiles = [
      tile('Total Commission', s.totalCommission, `${s.dealsCount} deal${s.dealsCount === 1 ? '' : 's'}`, '', 0),
      tile('Paid So Far', s.totalPaid, 'Handed over to this broker', 'accent-success', 1),
      tile('Still to be Given', s.totalPending, 'Commission still owed', s.totalPending > 0 ? 'accent-danger' : '', 2),
      tile('Advance Balance', s.advanceBalance, s.advanceBalance > 0 ? 'Broker owes this back (unearned advance)' : 'Fully settled', s.advanceBalance > 0 ? 'accent-danger' : '', 3),
    ];
    const container = document.getElementById('broker-tiles');
    container.innerHTML = tiles.join('');
    container.querySelectorAll('[data-countup]').forEach((el) => animateCountUp(el, Number(el.dataset.countup), { duration: 650 }));
  }

  // ---- Advances ----

  function renderAdvances(advances, stats) {
    const body = document.getElementById('advances-body');
    if (!advances.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="5">No advances given yet.</td></tr>';
      return;
    }
    body.innerHTML = advances.map((a) => `
      <tr>
        <td>${formatDate(a.date || a.createdAt)}</td>
        <td class="text-right num" style="font-weight:600;">${formatCurrency(a.amount)}</td>
        <td class="text-muted" style="font-size:12px;">${escapeHtml(paymentMethodLabel(a)) || '—'}</td>
        <td class="text-muted">${escapeHtml(a.notes || '')}</td>
        <td><div class="row-actions"><button type="button" class="btn btn-sm btn-danger" data-delete-advance="${a.id}">Delete</button></div></td>
      </tr>
    `).join('');
    staggerRows(body, { stepMs: 30, maxDelayMs: 200 });
    body.querySelectorAll('[data-delete-advance]').forEach((btn) => {
      btn.addEventListener('click', withButtonBusy(btn, async () => {
        if (!confirm('Delete this advance record? (Only do this if it was entered by mistake — deleting it after it has already been offset against a deal will make the numbers inconsistent.)')) return;
        try {
          await apiRequest(`/broker-advances/${btn.dataset.deleteAdvance}`, { method: 'DELETE' });
          load();
        } catch (err) { showBanner(err.message); }
      }));
    });
  }

  document.getElementById('add-advance-btn').addEventListener('click', () => {
    openFormModal({
      title: 'Record Advance',
      submitLabel: 'Record Advance',
      fields: [
        { name: 'amount', label: 'Amount given (Rs.)', type: 'number', step: '0.01', required: true },
        { name: 'date', label: 'Date given', type: 'date', value: today() },
        { name: 'paidThrough', label: 'Paid Through', type: 'select', value: '', options: [
          { value: '', label: '— Not specified —' }, { value: 'cash', label: 'Cash' },
          { value: 'pay_order', label: 'Pay Order' }, { value: 'cheque', label: 'Cheque' },
        ] },
        { name: 'referenceNumber', label: 'Pay Order / Cheque Number' },
        { name: 'bankName', label: 'Bank Name' },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
      onSubmit: async (values) => {
        await apiRequest(`/brokers/${brokerId}/advances`, { method: 'POST', body: values });
        load();
      },
    });
  });

  // ---- Deals ----

  // The earliest commission installment that's promised but not yet paid.
  function nextDueOf(payments) {
    const pending = (payments || []).filter((p) => !p.paidDate && p.dueDate);
    if (!pending.length) return null;
    pending.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    const next = pending[0];
    return Object.assign({}, next, { overdue: new Date(next.dueDate) < new Date(today()) });
  }

  function renderDeals(deals) {
    const body = document.getElementById('deals-body');
    if (!deals.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="7">No deals added yet.</td></tr>';
      return;
    }
    body.innerHTML = deals.map((d) => {
      const due = nextDueOf(d.payments);
      const dueCell = due
        ? `${formatCurrency(due.amount)}<div style="font-size:11px; ${due.overdue ? 'color:var(--danger); font-weight:700;' : 'color:var(--text-muted);'}">${formatDate(due.dueDate)}${due.overdue ? ' · OVERDUE' : ''}</div>`
        : '<span class="text-muted">—</span>';
      return `
      <tr>
        <td style="font-weight:700;">${escapeHtml(d.description)}${d.dealDate ? `<div class="text-muted" style="font-size:11px; font-weight:400;">${formatDate(d.dealDate)}</div>` : ''}</td>
        <td class="text-right num">${d.dealValue ? formatCurrency(d.dealValue) : '<span class="text-muted">—</span>'}</td>
        <td class="text-right num" style="font-weight:700;">${formatCurrency(d.stats.commissionAmount)}</td>
        <td class="text-right num" style="color:var(--success);">${formatCurrency(d.stats.totalPaid)}</td>
        <td class="text-right num" style="color:${d.stats.remaining > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${formatCurrency(d.stats.remaining)}</td>
        <td class="num">${dueCell}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm" data-pay="${d.id}">Commission</button>
            <button class="btn btn-ghost btn-sm" data-edit-deal="${d.id}">Edit</button>
            <button class="btn btn-danger btn-sm" data-delete-deal="${d.id}">Delete</button>
          </div>
        </td>
      </tr>
    `;
    }).join('');
    staggerRows(body, { stepMs: 35 });
  }

  function dealFields(deal) {
    const v = deal || {};
    return [
      { name: 'description', label: 'Deal description', required: true, placeholder: 'e.g. Sold Plot RT-5, Gulberg Colony to Ahmed Khan', value: v.description },
      { name: 'dealValue', label: 'Deal value (Rs., optional reference)', type: 'number', step: '0.01', value: v.dealValue != null ? v.dealValue : 0 },
      { name: 'commissionAmount', label: 'Commission amount (Rs.)', type: 'number', step: '0.01', required: true, value: v.commissionAmount != null ? v.commissionAmount : 0 },
      { name: 'dealDate', label: 'Deal date', type: 'date', value: v.dealDate || today() },
      { name: 'notes', label: 'Notes', type: 'textarea', value: v.notes },
    ];
  }

  document.getElementById('add-deal-btn').addEventListener('click', () => {
    openFormModal({
      title: 'Add Deal',
      submitLabel: 'Add Deal',
      fields: dealFields(),
      onSubmit: async (values) => {
        await apiRequest(`/brokers/${brokerId}/deals`, { method: 'POST', body: values });
        load();
      },
    });
  });

  document.getElementById('deals-body').addEventListener('click', (e) => {
    const payBtn = e.target.closest('[data-pay]');
    const editBtn = e.target.closest('[data-edit-deal]');
    const delBtn = e.target.closest('[data-delete-deal]');
    if (payBtn) openDealPaymentsModal(payBtn.dataset.pay);
    if (editBtn) {
      const deal = state.broker.deals.find((d) => d.id === editBtn.dataset.editDeal);
      openFormModal({
        title: 'Edit Deal',
        submitLabel: 'Save Changes',
        fields: dealFields(deal),
        onSubmit: async (values) => {
          await apiRequest(`/broker-deals/${deal.id}`, { method: 'PUT', body: values });
          load();
        },
      });
    }
    if (delBtn) {
      withButtonBusy(delBtn, async () => {
        if (!confirm('Delete this deal and all of its commission payment history?')) return;
        try {
          await apiRequest(`/broker-deals/${delBtn.dataset.deleteDeal}`, { method: 'DELETE' });
          load();
        } catch (err) { showBanner(err.message); }
      })();
    }
  });

  function paymentsModalHtml(deal) {
    const rows = deal.payments.length ? deal.payments.map((p) => `
      <tr>
        <td class="text-right num" style="color:var(--success); font-weight:600;">${formatCurrency(p.amount)}</td>
        <td>${formatDate(p.dueDate)}</td>
        <td>${p.paidDate ? formatDate(p.paidDate) : '<span class="badge badge-warning">Pending</span>'}</td>
        <td class="text-muted" style="font-size:12px;">${escapeHtml(paymentMethodLabel(p)) || '—'}</td>
        <td class="text-muted">${escapeHtml(p.notes || '')}</td>
        <td>
          <div class="row-actions">
            <button type="button" class="btn btn-sm btn-ghost" data-print="${p.id}">🖨 Print</button>
            ${!p.paidDate ? `<button type="button" class="btn btn-sm btn-ghost" data-mark-paid="${p.id}">Mark Paid</button>` : ''}
            <button type="button" class="btn btn-sm btn-danger" data-delete-payment="${p.id}">Delete</button>
          </div>
        </td>
      </tr>
    `).join('') : '<tr class="empty-row"><td colspan="6">No commission payments recorded yet.</td></tr>';

    const advanceBalance = state.broker.stats.advanceBalance;

    return `
      <div class="table-wrap" style="margin-bottom:18px;">
        <table>
          <thead><tr><th class="text-right">Amount</th><th>Due date</th><th>Paid date</th><th>Paid Through</th><th>Notes</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="modal-actions" style="justify-content:flex-start; margin-bottom:16px;">
        <button type="button" class="btn btn-accent btn-sm" data-open-plan>+ Create Installment Plan</button>
      </div>
      <div style="font-weight:700; font-size:13px; margin-bottom:10px;">Add a Single Payment</div>
      <form id="add-payment-form">
        <div class="field-grid">
          <label class="field"><span>Amount (Rs.)</span><input type="number" step="0.01" name="amount" required /></label>
          <label class="field"><span>Due date (if promised for later)</span><input type="date" name="dueDate" /></label>
          <label class="field"><span>Paid date (leave blank if not paid yet)</span><input type="date" name="paidDate" /></label>
          <label class="field"><span>Settle Using</span>
            <select name="source" id="payment-source">
              <option value="cash">A new payment (cash / pay order / cheque)</option>
              ${advanceBalance > 0 ? `<option value="advance">Offset from Advance (Rs. ${formatCurrency(advanceBalance).replace('Rs. ', '')} available)</option>` : ''}
            </select>
          </label>
          <div id="payment-method-fields" class="field-grid" style="grid-column:1/-1;">${paymentMethodFieldsHtml()}</div>
          <label class="field field-wide"><span>Notes</span><input type="text" name="notes" placeholder="e.g. 1st installment" /></label>
        </div>
        <div class="modal-error" id="payment-form-error" hidden></div>
        <div class="modal-actions"><button type="submit" class="btn btn-primary" id="add-payment-submit">Add Payment</button></div>
      </form>
    `;
  }

  function openDealPaymentsModal(dealId) {
    const deal = state.broker.deals.find((d) => d.id === dealId);
    if (!deal) return;
    openCustomModal(`Commission — ${deal.description}`, paymentsModalHtml(deal), (root) => {
      const submitBtn = root.querySelector('#add-payment-submit');
      const sourceSelect = root.querySelector('#payment-source');
      const methodFields = root.querySelector('#payment-method-fields');
      const toggleMethodFields = () => { methodFields.hidden = sourceSelect.value === 'advance'; };
      sourceSelect.addEventListener('change', toggleMethodFields);
      toggleMethodFields();
      root.querySelector('#add-payment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const errBox = root.querySelector('#payment-form-error');
        setButtonLoading(submitBtn, true, 'Adding…');
        try {
          await apiRequest(`/broker-deals/${dealId}/payments`, {
            method: 'POST',
            body: {
              amount: form.elements.amount.value,
              dueDate: form.elements.dueDate.value,
              paidDate: form.elements.paidDate.value,
              source: form.elements.source.value,
              paidThrough: form.elements.paidThrough.value,
              referenceNumber: form.elements.referenceNumber.value,
              bankName: form.elements.bankName.value,
              notes: form.elements.notes.value,
            },
          });
          await load();
          openDealPaymentsModal(dealId);
        } catch (err) {
          errBox.textContent = err.message;
          errBox.hidden = false;
          setButtonLoading(submitBtn, false);
        }
      });
      root.querySelectorAll('[data-mark-paid]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const payment = deal.payments.find((p) => p.id === btn.dataset.markPaid);
          openSettlePaymentModal({
            title: 'Mark Commission Paid',
            defaultDate: (payment && payment.dueDate) || today(),
            onCancel: () => openDealPaymentsModal(dealId),
            onConfirm: async ({ paidDate, paidThrough, referenceNumber, bankName }) => {
              await apiRequest(`/broker-payments/${btn.dataset.markPaid}`, {
                method: 'PUT',
                body: { paidDate, paidThrough, referenceNumber, bankName },
              });
              await load();
              openDealPaymentsModal(dealId);
            },
          });
        });
      });
      root.querySelectorAll('[data-delete-payment]').forEach((btn) => {
        btn.addEventListener('click', withButtonBusy(btn, async () => {
          if (!confirm('Delete this commission payment record?')) return;
          try {
            await apiRequest(`/broker-payments/${btn.dataset.deletePayment}`, { method: 'DELETE' });
            await load();
            openDealPaymentsModal(dealId);
          } catch (err) { showBanner(err.message); }
        }));
      });
      root.querySelector('[data-open-plan]').addEventListener('click', () => openDealInstallmentPlanModal(dealId));
      root.querySelectorAll('[data-print]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const url = `receipt.html?apiBase=/brokers&brokerId=${encodeURIComponent(brokerId)}&dealId=${encodeURIComponent(dealId)}&paymentId=${encodeURIComponent(btn.dataset.print)}`;
          window.open(url, '_blank');
        });
      });
    });
  }

  // Commission is usually settled in days/weeks, not months, so this plan
  // uses the day-based quick-fill (see common.js's installment plan builder).
  function openDealInstallmentPlanModal(dealId) {
    const deal = state.broker.deals.find((d) => d.id === dealId);
    if (!deal) return;
    openCustomModal(`Create Installment Plan — ${deal.description}`, `<form id="plan-form">${installmentPlanFormHtml({ includeDirection: false, unit: 'days' })}</form>`, (root) => {
      initInstallmentPlanRows(root, 'days');
      root.querySelector('[data-plan-cancel]').addEventListener('click', () => openDealPaymentsModal(dealId));
      root.querySelector('#plan-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errBox = root.querySelector('#plan-error');
        const submitBtn = root.querySelector('[data-plan-submit]');
        const { upfrontAmount, upfrontDate, upfrontPaidThrough, upfrontReferenceNumber, upfrontBankName, installments } = collectInstallmentPlan(root);
        if (upfrontAmount <= 0 && !installments.length) {
          errBox.textContent = 'Enter an upfront amount and/or at least one installment.';
          errBox.hidden = false;
          return;
        }
        const missingDate = installments.find((row) => !row.dueDate);
        if (missingDate) {
          errBox.textContent = 'Every installment needs a due date (type days-after, or pick a date directly).';
          errBox.hidden = false;
          return;
        }
        errBox.hidden = true;
        setButtonLoading(submitBtn, true, 'Creating…');
        try {
          if (upfrontAmount > 0) {
            await apiRequest(`/broker-deals/${dealId}/payments`, {
              method: 'POST',
              body: {
                amount: upfrontAmount, paidDate: upfrontDate, notes: 'Upfront commission',
                paidThrough: upfrontPaidThrough, referenceNumber: upfrontReferenceNumber, bankName: upfrontBankName,
              },
            });
          }
          for (const row of installments) {
            await apiRequest(`/broker-deals/${dealId}/payments`, {
              method: 'POST',
              body: { amount: row.amount, dueDate: row.dueDate, notes: 'Commission installment' },
            });
          }
          await load();
          openDealPaymentsModal(dealId);
        } catch (err) {
          errBox.textContent = err.message;
          errBox.hidden = false;
          setButtonLoading(submitBtn, false);
        }
      });
    });
  }

  // ---- Broker header actions ----

  document.getElementById('edit-broker-btn').addEventListener('click', () => {
    const b = state.broker;
    openFormModal({
      title: 'Edit Broker',
      submitLabel: 'Save',
      fields: [
        { name: 'name', label: 'Broker name', required: true, value: b.name },
        { name: 'phone', label: 'Phone', value: b.phone },
        { name: 'cnic', label: 'CNIC', value: b.cnic },
        { name: 'notes', label: 'Notes', type: 'textarea', value: b.notes },
      ],
      onSubmit: async (values) => {
        await apiRequest(`/brokers/${brokerId}`, { method: 'PUT', body: values });
        load();
      },
    });
  });

  document.getElementById('delete-broker-btn').addEventListener('click', withButtonBusy(document.getElementById('delete-broker-btn'), async () => {
    if (!confirm('Delete this broker, including all of their deals and commission payments? This cannot be undone.')) return;
    try {
      await apiRequest(`/brokers/${brokerId}`, { method: 'DELETE' });
      window.location.href = 'brokers.html';
    } catch (err) {
      showBanner(err.message);
    }
  }));

  load();
})();
