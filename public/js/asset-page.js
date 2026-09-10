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
        const cancelled = r.status === 'cancelled';
        const saleCell = r.status === 'sold'
          ? `Price: ${formatCurrency(r.salePrice)}${r.discount ? ` <span class="text-muted">(Rs. ${formatCurrency(r.discount).replace('Rs. ', '')} discount)</span>` : ''}<br>Received: <span style="color:var(--success)">${formatCurrency(s.totalReceived)}</span><br>Receivable: <span style="color:${s.totalReceivable > 0 ? 'var(--danger)' : 'var(--text-muted)'}">${formatCurrency(s.totalReceivable)}</span>`
          : (cancelled
            ? `<span class="text-muted">Sale cancelled${r.cancelReason ? ' — ' + escapeHtml(r.cancelReason) : ''}</span><br>Received: <span style="color:var(--success)">${formatCurrency(s.totalReceived)}</span>`
            : '<span class="text-muted">Not sold yet</span>');
        return `
        <tr style="${cancelled ? 'opacity:0.6;' : ''}">
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
              <a class="btn btn-ghost btn-sm" href="asset-detail.html?type=${encodeURIComponent(config.type)}&id=${r.id}">Open</a>
              <button class="btn btn-ghost btn-sm" data-edit="${r.id}">Edit</button>
              ${r.status === 'owned' ? `<button class="btn btn-ghost btn-sm" data-mark-sold="${r.id}">Mark Sold</button>` : ''}
              ${r.status === 'sold' ? `<button class="btn btn-ghost btn-sm" data-cancel-sale="${r.id}">Cancel Sale</button>` : ''}
              ${cancelled ? `<button class="btn btn-ghost btn-sm" data-reactivate="${r.id}">Reactivate</button>` : ''}
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
        { name: 'frontFt', label: 'Front (feet)', type: 'number', step: '0.01', value: v.frontFt != null ? v.frontFt : 0 },
        { name: 'lengthFt', label: 'Length / Depth (feet)', type: 'number', step: '0.01', value: v.lengthFt != null ? v.lengthFt : 0 },
        { name: 'sizeValue', label: 'Size (for price calculator, optional)', type: 'number', step: '0.01', value: v.sizeValue || '' },
        { name: 'sizeUnit', label: 'Size Unit', type: 'select', value: v.sizeUnit || 'marla', options: SIZE_UNIT_OPTIONS },
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
      const editBtn = e.target.closest('[data-edit]');
      const soldBtn = e.target.closest('[data-mark-sold]');
      const cancelBtn = e.target.closest('[data-cancel-sale]');
      const reactivateBtn = e.target.closest('[data-reactivate]');
      const delBtn = e.target.closest('[data-delete]');

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
            { name: 'sizeValue', label: 'Size (for price calculator, optional)', type: 'number', step: '0.01', value: row.sizeValue || '' },
            { name: 'sizeUnit', label: 'Size Unit', type: 'select', value: row.sizeUnit || 'marla', options: SIZE_UNIT_OPTIONS },
            { name: 'pricePerMarla', label: 'Price per Marla (Rs., optional)', type: 'number', step: '0.01', value: row.pricePerMarla || '' },
            { name: 'discount', label: 'Discount (Rs., if given)', type: 'number', step: '0.01', value: row.discount || '' },
            { name: 'salePrice', label: 'Sale price (Rs.)', type: 'number', step: '0.01', required: true, value: row.purchasePrice },
            { name: 'saleDate', label: 'Sale date', type: 'date', value: today() },
            { name: 'buyerName', label: `${config.buyerNoun} name`, required: true },
            { name: 'buyerPhone', label: `${config.buyerNoun} phone` },
          ],
          onSubmit: async (values) => {
            values.status = 'sold';
            await apiRequest(`${config.apiBase}/${row.id}`, { method: 'PUT', body: values });
            // The sale is very often not paid in full up front - jump straight
            // to that record's own page with its installment-plan builder
            // open, instead of leaving the client to go find it themselves.
            window.location.href = `asset-detail.html?type=${encodeURIComponent(config.type)}&id=${row.id}&openPlan=1`;
          },
        });
        wirePriceCalculator('salePrice');
      }

      // Cancel keeps the record, its buyer info and its full payment history
      // on record (with a "Cancelled" badge, and no longer counted as a live
      // sale) instead of erasing that the sale ever happened - Delete below
      // is the separate, permanent action for that. The underlying owned
      // land/shop/commercial record itself is untouched either way.
      if (cancelBtn) {
        const row = state.rows.find((r) => r.id === cancelBtn.dataset.cancelSale);
        openFormModal({
          title: 'Cancel Sale',
          submitLabel: 'Cancel Sale',
          fields: [
            { name: 'cancelReason', label: 'Reason (optional)', type: 'textarea', placeholder: 'e.g. buyer backed out' },
          ],
          onSubmit: async (values) => {
            await apiRequest(`${config.apiBase}/${row.id}`, { method: 'PUT', body: { status: 'cancelled', previousStatus: row.status, cancelReason: values.cancelReason } });
            load();
          },
        });
      }

      if (reactivateBtn) {
        withButtonBusy(reactivateBtn, async () => {
          const row = state.rows.find((r) => r.id === reactivateBtn.dataset.reactivate);
          try {
            await apiRequest(`${config.apiBase}/${row.id}`, { method: 'PUT', body: { status: row.previousStatus || 'sold', previousStatus: '', cancelReason: '' } });
            load();
          } catch (err) { showBanner(err.message); }
        })();
      }

      if (delBtn) {
        withButtonBusy(delBtn, async () => {
          if (!confirm(`Permanently delete this ${config.entityNoun.toLowerCase()} record and its payment history? This cannot be undone - if you just want to void the sale but keep it on record, use "Cancel Sale" instead.`)) return;
          try {
            await apiRequest(`${config.apiBase}/${delBtn.dataset.delete}`, { method: 'DELETE' });
            load();
          } catch (err) { showBanner(err.message); }
        })();
      }
    });

    // Payments, the installment plan builder, and printing a receipt all
    // live on the record's own dedicated page (asset-detail.html) reached
    // via "Open" above, instead of a modal here - see asset-detail.js.

    load();
  })();
}
