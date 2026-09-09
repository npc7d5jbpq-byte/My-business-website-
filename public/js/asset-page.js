// Drives the Agricultural Land, Shops, and Commercial Land & Plots pages.
// All three modules share the same buy/sell/payments shape on the backend,
// so one script (configured per page) covers all three.

function initAssetPage(config) {
  // config: { apiBase, navHref, pageTitle, entityNoun, buyerNoun }
  (async function () {
    const session = await initShell(config.navHref);
    if (!session) return;
    setPageTitle(config.pageTitle);
    document.getElementById('page-heading').textContent = `All ${config.pageTitle.toLowerCase()} records`;
    document.getElementById('add-btn').textContent = `+ Add ${config.entityNoun}`;

    const state = { rows: [] };
    const today = () => new Date().toISOString().slice(0, 10);

    document.getElementById('rows-body').innerHTML = skeletonRows(3, 6);

    async function load() {
      try {
        state.rows = await apiRequest(config.apiBase);
        render();
      } catch (err) {
        showBanner(err.message);
      }
    }

    function render() {
      const body = document.getElementById('rows-body');
      if (!state.rows.length) {
        body.innerHTML = `<tr class="empty-row"><td colspan="6">No ${config.pageTitle.toLowerCase()} records yet.</td></tr>`;
        return;
      }
      body.innerHTML = state.rows.map((r) => {
        const s = r.stats;
        const saleCell = r.status === 'sold'
          ? `Price: ${formatCurrency(r.salePrice)}<br>Received: <span style="color:var(--success)">${formatCurrency(s.totalReceived)}</span><br>Receivable: <span style="color:${s.totalReceivable > 0 ? 'var(--danger)' : 'var(--text-muted)'}">${formatCurrency(s.totalReceivable)}</span>`
          : '<span class="text-muted">Not sold yet</span>';
        return `
        <tr>
          <td>
            <div style="font-weight:700;">${escapeHtml(r.title)}</div>
            <div class="text-muted" style="font-size:11.5px;">${escapeHtml(r.location || '')}${r.area ? ` · ${escapeHtml(r.area)}` : ''}</div>
          </td>
          <td>${statusBadge(r.status)}</td>
          <td style="font-size:12.5px; line-height:1.6;">
            Price: ${formatCurrency(r.purchasePrice)}<br>
            Paid: <span style="color:var(--success)">${formatCurrency(s.totalPaid)}</span><br>
            Payable: <span style="color:${s.totalPayable > 0 ? 'var(--danger)' : 'var(--text-muted)'}">${formatCurrency(s.totalPayable)}</span>
          </td>
          <td style="font-size:12.5px; line-height:1.6;">${saleCell}</td>
          <td class="text-right num" style="color:${s.profit >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:700;">${r.status === 'sold' ? formatCurrency(s.profit) : '—'}</td>
          <td>
            <div class="row-actions">
              <button class="btn btn-ghost btn-sm" data-payments="${r.id}">Payments</button>
              <button class="btn btn-ghost btn-sm" data-edit="${r.id}">Edit</button>
              ${r.status !== 'sold' ? `<button class="btn btn-ghost btn-sm" data-mark-sold="${r.id}">Mark Sold</button>` : ''}
              <button class="btn btn-danger btn-sm" data-delete="${r.id}">Delete</button>
            </div>
          </td>
        </tr>`;
      }).join('');
      staggerRows(body, { stepMs: 40 });
    }

    function entityFields(row) {
      const v = row || {};
      return [
        { name: 'title', label: `${config.entityNoun} title / identifier`, required: true, value: v.title },
        { name: 'location', label: 'Location', value: v.location },
        { name: 'area', label: 'Area / size', value: v.area },
        { name: 'purchasePrice', label: 'Purchase price (Rs.)', type: 'number', step: '0.01', value: v.purchasePrice != null ? v.purchasePrice : 0 },
        { name: 'purchaseDate', label: 'Purchase date', type: 'date', value: v.purchaseDate },
        { name: 'sellerName', label: 'Seller name', value: v.sellerName },
        { name: 'sellerPhone', label: 'Seller phone', value: v.sellerPhone },
        { name: 'notes', label: 'Notes', type: 'textarea', value: v.notes },
      ];
    }

    document.getElementById('add-btn').addEventListener('click', () => {
      openFormModal({
        title: `Add ${config.entityNoun}`,
        submitLabel: 'Add',
        fields: entityFields(),
        onSubmit: async (values) => {
          await apiRequest(config.apiBase, { method: 'POST', body: values });
          load();
        },
      });
    });

    document.getElementById('rows-body').addEventListener('click', (e) => {
      const payBtn = e.target.closest('[data-payments]');
      const editBtn = e.target.closest('[data-edit]');
      const soldBtn = e.target.closest('[data-mark-sold]');
      const delBtn = e.target.closest('[data-delete]');

      if (payBtn) openPaymentsModal(payBtn.dataset.payments);

      if (editBtn) {
        const row = state.rows.find((r) => r.id === editBtn.dataset.edit);
        openFormModal({
          title: `Edit ${config.entityNoun}`,
          submitLabel: 'Save',
          fields: entityFields(row),
          onSubmit: async (values) => {
            await apiRequest(`${config.apiBase}/${row.id}`, { method: 'PUT', body: values });
            load();
          },
        });
      }

      if (soldBtn) {
        const row = state.rows.find((r) => r.id === soldBtn.dataset.markSold);
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
            await apiRequest(`${config.apiBase}/${row.id}`, { method: 'PUT', body: values });
            load();
          },
        });
      }

      if (delBtn) {
        withButtonBusy(delBtn, async () => {
          if (!confirm(`Delete this ${config.entityNoun.toLowerCase()} record and its payment history?`)) return;
          try {
            await apiRequest(`${config.apiBase}/${delBtn.dataset.delete}`, { method: 'DELETE' });
            load();
          } catch (err) { showBanner(err.message); }
        })();
      }
    });

    function paymentsModalHtml(row) {
      const rows = row.payments.length ? row.payments.map((p) => `
        <tr>
          <td>${p.direction === 'paid' ? `<span class="badge badge-danger">Paid to seller</span>` : `<span class="badge badge-success">Received from buyer</span>`}</td>
          <td class="text-right num" style="font-weight:600; color:${p.direction === 'paid' ? 'var(--danger)' : 'var(--success)'};">${formatCurrency(p.amount)}</td>
          <td>${formatDate(p.dueDate)}</td>
          <td>${p.paidDate ? formatDate(p.paidDate) : '<span class="badge badge-warning">Pending</span>'}</td>
          <td class="text-muted">${escapeHtml(p.notes || '')}</td>
          <td>
            <div class="row-actions">
              ${!p.paidDate ? `<button type="button" class="btn btn-sm btn-ghost" data-mark-paid="${p.id}">Mark Done</button>` : ''}
              <button type="button" class="btn btn-sm btn-danger" data-delete-payment="${p.id}">Delete</button>
            </div>
          </td>
        </tr>
      `).join('') : '<tr class="empty-row"><td colspan="6">No payments recorded yet.</td></tr>';

      return `
        <div class="table-wrap" style="margin-bottom:18px;">
          <table>
            <thead><tr><th>Type</th><th class="text-right">Amount</th><th>Due date</th><th>Settled</th><th>Notes</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="modal-actions" style="justify-content:flex-start; margin-bottom:16px;">
          <button type="button" class="btn btn-accent btn-sm" data-open-plan>+ Create Installment Plan</button>
        </div>
        <div style="font-weight:700; font-size:13px; margin-bottom:10px;">Add a Single Payment</div>
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
            <label class="field field-wide"><span>Notes</span><input type="text" name="notes" /></label>
          </div>
          <div class="modal-error" id="payment-form-error" hidden></div>
          <div class="modal-actions"><button type="submit" class="btn btn-primary" id="add-payment-submit">Add Payment</button></div>
        </form>
      `;
    }

    // The list endpoint only returns each row's summary stats (no payment
    // history, to keep that response light) - only the single-record detail
    // endpoint includes the full `payments` array, so it's fetched fresh
    // here rather than reused from state.rows.
    async function openPaymentsModal(rowId) {
      let row;
      try {
        row = await apiRequest(`${config.apiBase}/${rowId}`);
      } catch (err) {
        showBanner(err.message);
        return;
      }
      openCustomModal(`Payments — ${row.title}`, paymentsModalHtml(row), (root) => {
        const submitBtn = root.querySelector('#add-payment-submit');
        root.querySelector('#add-payment-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const form = e.target;
          const errBox = root.querySelector('#payment-form-error');
          setButtonLoading(submitBtn, true, 'Adding…');
          try {
            await apiRequest(`${config.apiBase}/${rowId}/payments`, {
              method: 'POST',
              body: {
                direction: form.elements.direction.value,
                amount: form.elements.amount.value,
                dueDate: form.elements.dueDate.value,
                paidDate: form.elements.paidDate.value,
                notes: form.elements.notes.value,
              },
            });
            await load();
            openPaymentsModal(rowId);
          } catch (err) {
            errBox.textContent = err.message;
            errBox.hidden = false;
            setButtonLoading(submitBtn, false);
          }
        });
        root.querySelectorAll('[data-mark-paid]').forEach((btn) => {
          btn.addEventListener('click', withButtonBusy(btn, async () => {
            try {
              await apiRequest(`${config.apiBase}/payments/${btn.dataset.markPaid}`, { method: 'PUT', body: { paidDate: today() } });
              await load();
              openPaymentsModal(rowId);
            } catch (err) { showBanner(err.message); }
          }));
        });
        root.querySelectorAll('[data-delete-payment]').forEach((btn) => {
          btn.addEventListener('click', withButtonBusy(btn, async () => {
            if (!confirm('Delete this payment record?')) return;
            try {
              await apiRequest(`${config.apiBase}/payments/${btn.dataset.deletePayment}`, { method: 'DELETE' });
              await load();
              openPaymentsModal(rowId);
            } catch (err) { showBanner(err.message); }
          }));
        });
        root.querySelector('[data-open-plan]').addEventListener('click', () => openInstallmentPlanModal(rowId, row.title));
      });
    }

    function openInstallmentPlanModal(rowId, title) {
      openCustomModal(`Create Installment Plan — ${title}`, `<form id="plan-form">${installmentPlanFormHtml({ includeDirection: true })}</form>`, (root) => {
        initInstallmentPlanRows(root);
        root.querySelector('[data-plan-cancel]').addEventListener('click', () => openPaymentsModal(rowId));
        root.querySelector('#plan-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const errBox = root.querySelector('#plan-error');
          const submitBtn = root.querySelector('[data-plan-submit]');
          const direction = root.querySelector('[name=planDirection]').value;
          const { upfrontAmount, upfrontDate, installments } = collectInstallmentPlan(root);
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
              await apiRequest(`${config.apiBase}/${rowId}/payments`, {
                method: 'POST',
                body: { direction, amount: upfrontAmount, paidDate: upfrontDate, notes: 'Upfront / Bayana' },
              });
            }
            for (const row of installments) {
              await apiRequest(`${config.apiBase}/${rowId}/payments`, {
                method: 'POST',
                body: { direction, amount: row.amount, dueDate: row.dueDate, notes: 'Installment' },
              });
            }
            await load();
            openPaymentsModal(rowId);
          } catch (err) {
            errBox.textContent = err.message;
            errBox.hidden = false;
            setButtonLoading(submitBtn, false);
          }
        });
      });
    }

    load();
  })();
}
