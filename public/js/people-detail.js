(async function () {
  const session = await initShell('people.html');
  if (!session) return;

  const personId = new URLSearchParams(window.location.search).get('id');
  if (!personId) {
    document.body.innerHTML = '<p style="padding:40px;">No person specified. <a href="people.html">Back to People</a></p>';
    return;
  }

  const state = { person: null };
  const today = () => new Date().toISOString().slice(0, 10);

  document.getElementById('person-tiles').innerHTML = skeletonCards(4);
  document.getElementById('deals-body').innerHTML = skeletonRows(3, 7);

  async function load() {
    try {
      state.person = await apiRequest(`/people/${personId}`);
      renderAll();
    } catch (err) {
      showBanner(err.message);
    }
  }

  function renderAll() {
    const p = state.person;
    setPageTitle(p.name);
    document.getElementById('person-name').innerHTML = personLink(p.name);
    document.getElementById('person-phone').textContent = p.phone || 'No phone on file';
    renderTiles(p.stats);
    renderDeals(p.deals);
  }

  function tile(label, value, sub, accent, i) {
    return `<div class="card stat-tile ${accent || ''} entrance" style="animation-delay:${i * 55}ms"><span class="label">${label}</span><span class="value" data-countup="${value}">Rs. 0</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
  }

  function renderTiles(s) {
    const tiles = [
      tile('Owed to the Office', s.totalReceivable, `${s.dealsCount} deal${s.dealsCount === 1 ? '' : 's'}`, s.totalReceivable > 0 ? 'accent-danger' : '', 0),
      tile('Received From Them', s.totalReceived, 'Settled so far', 'accent-success', 1),
      tile('Owed to Them', s.totalPayable, 'Still to be paid', s.totalPayable > 0 ? 'accent-danger' : '', 2),
      tile('Paid to Them', s.totalPaid, 'Settled so far', 'accent-success', 3),
    ];
    const container = document.getElementById('person-tiles');
    container.innerHTML = tiles.join('');
    container.querySelectorAll('[data-countup]').forEach((el) => animateCountUp(el, Number(el.dataset.countup), { duration: 650 }));
  }

  // ---- Deals ----

  const DIRECTION_LABEL = { receivable: 'They owe us', payable: 'We owe them' };

  // The earliest installment that's promised but not yet settled.
  function nextDueOf(payments) {
    const pending = (payments || []).filter((p) => !p.paidDate && p.dueDate && p.status !== 'rescheduled');
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
      const cancelled = d.status === 'cancelled';
      const due = cancelled ? null : nextDueOf(d.payments);
      const dueCell = due
        ? `${formatCurrency(due.amount)}<div style="font-size:11px; ${due.overdue ? 'color:var(--danger); font-weight:700;' : 'color:var(--text-muted);'}">${formatDate(due.dueDate)}${due.overdue ? ' · OVERDUE' : ''}</div>`
        : '<span class="text-muted">—</span>';
      return `
      <tr style="${cancelled ? 'opacity:0.6;' : ''}">
        <td style="font-weight:700;">
          <span style="${cancelled ? 'text-decoration:line-through;' : ''}">${escapeHtml(d.description)}</span>
          ${cancelled ? '<span class="badge badge-danger" style="margin-left:6px;">Cancelled</span>' : ''}
          ${d.dealDate ? `<div class="text-muted" style="font-size:11px; font-weight:400;">${formatDate(d.dealDate)}</div>` : ''}
          ${cancelled && d.cancelReason ? `<div class="text-muted" style="font-size:11px; font-weight:400;">Reason: ${escapeHtml(d.cancelReason)}</div>` : ''}
        </td>
        <td><span class="badge ${d.direction === 'payable' ? 'badge-danger' : 'badge-success'}">${DIRECTION_LABEL[d.direction] || d.direction}</span></td>
        <td class="text-right num" style="font-weight:700;">${formatCurrency(d.stats.amount)}</td>
        <td class="text-right num" style="color:var(--success);">${formatCurrency(d.stats.totalPaid)}</td>
        <td class="text-right num" style="color:${!cancelled && d.stats.remaining > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${cancelled ? '<span class="text-muted">—</span>' : formatCurrency(d.stats.remaining)}</td>
        <td class="num">${dueCell}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm" data-pay="${d.id}">Payments</button>
            <button class="btn btn-ghost btn-sm" data-edit-deal="${d.id}">Edit</button>
            ${cancelled
              ? `<button class="btn btn-ghost btn-sm" data-reactivate-deal="${d.id}">Reactivate</button>`
              : `<button class="btn btn-ghost btn-sm" data-cancel-deal="${d.id}">Cancel Deal</button>`}
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
      { name: 'description', label: 'Deal description', required: true, placeholder: 'e.g. Loan given, service rendered, sold a car', value: v.description },
      { name: 'direction', label: 'Type', type: 'select', value: v.direction || 'receivable', options: [
        { value: 'receivable', label: 'They owe us (Receivable)' },
        { value: 'payable', label: 'We owe them (Payable)' },
      ] },
      { name: 'amount', label: 'Deal amount (Rs.)', type: 'number', step: '0.01', required: true, value: v.amount != null ? v.amount : 0 },
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
        await apiRequest(`/people/${personId}/deals`, { method: 'POST', body: values });
        load();
      },
    });
  });

  document.getElementById('deals-body').addEventListener('click', (e) => {
    const payBtn = e.target.closest('[data-pay]');
    const editBtn = e.target.closest('[data-edit-deal]');
    const cancelBtn = e.target.closest('[data-cancel-deal]');
    const reactivateBtn = e.target.closest('[data-reactivate-deal]');
    const delBtn = e.target.closest('[data-delete-deal]');
    if (payBtn) openDealPaymentsModal(payBtn.dataset.pay);
    if (editBtn) {
      const deal = state.person.deals.find((d) => d.id === editBtn.dataset.editDeal);
      openFormModal({
        title: 'Edit Deal',
        submitLabel: 'Save Changes',
        fields: dealFields(deal),
        onSubmit: async (values) => {
          await apiRequest(`/person-deals/${deal.id}`, { method: 'PUT', body: values });
          load();
        },
      });
    }
    // Cancel keeps the deal on record (with a "Cancelled" badge, and no
    // longer counted as owed either way) instead of erasing that it ever
    // happened - Delete below is the separate, permanent action for that.
    if (cancelBtn) {
      openFormModal({
        title: 'Cancel Deal',
        submitLabel: 'Cancel Deal',
        fields: [
          { name: 'cancelReason', label: 'Reason (optional)', type: 'textarea', placeholder: 'e.g. deal fell through' },
        ],
        onSubmit: async (values) => {
          await apiRequest(`/person-deals/${cancelBtn.dataset.cancelDeal}`, { method: 'PUT', body: { status: 'cancelled', cancelReason: values.cancelReason } });
          load();
        },
      });
    }
    if (reactivateBtn) {
      withButtonBusy(reactivateBtn, async () => {
        try {
          await apiRequest(`/person-deals/${reactivateBtn.dataset.reactivateDeal}`, { method: 'PUT', body: { status: 'active', cancelReason: '' } });
          load();
        } catch (err) { showBanner(err.message); }
      })();
    }
    if (delBtn) {
      withButtonBusy(delBtn, async () => {
        if (!confirm('Permanently delete this deal and all of its payment history? This cannot be undone - if you just want to void the deal but keep it on record, use "Cancel Deal" instead.')) return;
        try {
          await apiRequest(`/person-deals/${delBtn.dataset.deleteDeal}`, { method: 'DELETE' });
          load();
        } catch (err) { showBanner(err.message); }
      })();
    }
  });

  function paymentsModalHtml(deal) {
    const cancelled = deal.status === 'cancelled';
    const settledWord = deal.direction === 'payable' ? 'Paid date' : 'Received date';
    const rows = deal.payments.length ? deal.payments.map((p) => {
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
            ${!p.paidDate && !rescheduled ? `<button type="button" class="btn btn-sm btn-ghost" data-mark-paid="${p.id}">Mark ${deal.direction === 'payable' ? 'Paid' : 'Received'}</button>` : ''}
            ${!p.paidDate && !rescheduled ? `<button type="button" class="btn btn-sm btn-ghost" data-reschedule="${p.id}" title="Wasn't given/received on time — set a new date">Reschedule</button>` : ''}
            <button type="button" class="btn btn-sm btn-danger" data-delete-payment="${p.id}">Delete</button>
          </div>
        </td>
      </tr>
    `;
    }).join('') : '<tr class="empty-row"><td colspan="6">No payments recorded yet.</td></tr>';

    const addPaymentSection = cancelled ? `
      <p class="text-muted" style="font-size:12.5px;">This deal is cancelled — it's void, so no new payments can be added. Reactivate it from the Deals list first if that was a mistake.</p>
    ` : `
      <div class="modal-actions" style="justify-content:flex-start; margin-bottom:16px;">
        <button type="button" class="btn btn-accent btn-sm" data-open-plan>+ Create Installment Plan</button>
      </div>
      <div style="font-weight:700; font-size:13px; margin-bottom:10px;">Add a Single Payment</div>
      <form id="add-payment-form">
        <div class="field-grid">
          <label class="field"><span>Amount (Rs.)</span><input type="number" step="0.01" name="amount" required /></label>
          <label class="field"><span>Due date (if promised for later)</span><input type="date" name="dueDate" /></label>
          <label class="field"><span>${settledWord} (leave blank if not settled yet)</span><input type="date" name="paidDate" /></label>
          <div id="payment-method-fields" class="field-grid" style="grid-column:1/-1;">${paymentMethodFieldsHtml()}</div>
          <label class="field field-wide"><span>Notes</span><input type="text" name="notes" placeholder="e.g. 1st installment" /></label>
        </div>
        <div class="modal-error" id="payment-form-error" hidden></div>
        <div class="modal-actions"><button type="submit" class="btn btn-primary" id="add-payment-submit">Add Payment</button></div>
      </form>
    `;

    return `
      <div class="modal-actions" style="justify-content:flex-start; margin-bottom:12px;">
        <button type="button" class="btn btn-ghost btn-sm" data-print-statement>🖨 Print Full Statement</button>
      </div>
      <div class="table-wrap" style="margin-bottom:18px;">
        <table>
          <thead><tr><th class="text-right">Amount</th><th>Due date</th><th>${settledWord}</th><th>Paid Through</th><th>Notes</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${addPaymentSection}
    `;
  }

  function openDealPaymentsModal(dealId) {
    const deal = state.person.deals.find((d) => d.id === dealId);
    if (!deal) return;
    openCustomModal(`Payments — ${deal.description}`, paymentsModalHtml(deal), (root) => {
      const submitBtn = root.querySelector('#add-payment-submit');
      if (submitBtn) {
        root.querySelector('#add-payment-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const form = e.target;
          const errBox = root.querySelector('#payment-form-error');
          setButtonLoading(submitBtn, true, 'Adding…');
          try {
            await apiRequest(`/person-deals/${dealId}/payments`, {
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
            await load();
            openDealPaymentsModal(dealId);
          } catch (err) {
            errBox.textContent = err.message;
            errBox.hidden = false;
            setButtonLoading(submitBtn, false);
          }
        });
      }
      root.querySelectorAll('[data-mark-paid]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const payment = deal.payments.find((p) => p.id === btn.dataset.markPaid);
          openSettlePaymentModal({
            title: `Mark ${deal.direction === 'payable' ? 'Paid' : 'Received'}`,
            defaultDate: (payment && payment.dueDate) || today(),
            onCancel: () => openDealPaymentsModal(dealId),
            onConfirm: async ({ paidDate, paidThrough, referenceNumber, bankName, paidBy }) => {
              await apiRequest(`/person-payments/${btn.dataset.markPaid}`, {
                method: 'PUT',
                body: { paidDate, paidThrough, referenceNumber, bankName, paidBy },
              });
              await load();
              openDealPaymentsModal(dealId);
            },
          });
        });
      });
      root.querySelectorAll('[data-reschedule]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const payment = deal.payments.find((p) => p.id === btn.dataset.reschedule);
          openRescheduleModal({
            title: 'Reschedule Payment',
            originalDueDate: payment && payment.dueDate,
            onCancel: () => openDealPaymentsModal(dealId),
            onConfirm: async ({ newDueDate, reason }) => {
              await apiRequest(`/person-payments/${btn.dataset.reschedule}`, {
                method: 'PUT',
                body: { status: 'rescheduled', notes: `${payment.notes ? payment.notes + ' — ' : ''}Missed, rescheduled to ${formatDate(newDueDate)}${reason ? ' (' + reason + ')' : ''}` },
              });
              await apiRequest(`/person-deals/${dealId}/payments`, {
                method: 'POST',
                body: { amount: payment.amount, dueDate: newDueDate, notes: `Rescheduled from ${formatDate(payment.dueDate)}${reason ? ' — ' + reason : ''}` },
              });
              await load();
              openDealPaymentsModal(dealId);
            },
          });
        });
      });
      root.querySelectorAll('[data-delete-payment]').forEach((btn) => {
        btn.addEventListener('click', withButtonBusy(btn, async () => {
          if (!confirm('Delete this payment record?')) return;
          try {
            await apiRequest(`/person-payments/${btn.dataset.deletePayment}`, { method: 'DELETE' });
            await load();
            openDealPaymentsModal(dealId);
          } catch (err) { showBanner(err.message); }
        }));
      });
      const openPlanBtn = root.querySelector('[data-open-plan]');
      if (openPlanBtn) openPlanBtn.addEventListener('click', () => openDealInstallmentPlanModal(dealId));
      const printStatementBtn = root.querySelector('[data-print-statement]');
      if (printStatementBtn) printStatementBtn.addEventListener('click', () => {
        const url = `statement.html?apiBase=/people&personId=${encodeURIComponent(personId)}&dealId=${encodeURIComponent(dealId)}`;
        window.open(url, '_blank');
      });
      root.querySelectorAll('[data-print]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const url = `receipt.html?apiBase=/people&personId=${encodeURIComponent(personId)}&dealId=${encodeURIComponent(dealId)}&paymentId=${encodeURIComponent(btn.dataset.print)}`;
          window.open(url, '_blank');
        });
      });
    });
  }

  function openDealInstallmentPlanModal(dealId) {
    const deal = state.person.deals.find((d) => d.id === dealId);
    if (!deal) return;
    openCustomModal(`Create Installment Plan — ${deal.description}`, `<form id="plan-form">${installmentPlanFormHtml({ includeDirection: false, unit: 'months' })}</form>`, (root) => {
      initInstallmentPlanRows(root, 'months');
      root.querySelector('[data-plan-cancel]').addEventListener('click', () => openDealPaymentsModal(dealId));
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
            await apiRequest(`/person-deals/${dealId}/payments`, {
              method: 'POST',
              body: {
                amount: upfrontAmount, paidDate: upfrontDate, notes: 'Upfront payment',
                paidThrough: upfrontPaidThrough, referenceNumber: upfrontReferenceNumber, bankName: upfrontBankName, paidBy: upfrontPaidBy,
              },
            });
          }
          for (const row of installments) {
            await apiRequest(`/person-deals/${dealId}/payments`, {
              method: 'POST',
              body: { amount: row.amount, dueDate: row.dueDate, notes: 'Installment' },
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

  // ---- Person header actions ----

  document.getElementById('edit-person-btn').addEventListener('click', () => {
    const p = state.person;
    openFormModal({
      title: 'Edit Person',
      submitLabel: 'Save',
      fields: [
        { name: 'name', label: 'Name', required: true, value: p.name },
        { name: 'phone', label: 'Phone', value: p.phone },
        { name: 'cnic', label: 'CNIC', value: p.cnic },
        { name: 'notes', label: 'Notes', type: 'textarea', value: p.notes },
      ],
      onSubmit: async (values) => {
        await apiRequest(`/people/${personId}`, { method: 'PUT', body: values });
        load();
      },
    });
  });

  document.getElementById('delete-person-btn').addEventListener('click', withButtonBusy(document.getElementById('delete-person-btn'), async () => {
    if (!confirm('Delete this person, including all of their deals and payment history? This cannot be undone.')) return;
    try {
      await apiRequest(`/people/${personId}`, { method: 'DELETE' });
      window.location.href = 'people.html';
    } catch (err) {
      showBanner(err.message);
    }
  }));

  load();
  renderAttachmentsSection('person-entity-documents', 'person', personId);
})();
