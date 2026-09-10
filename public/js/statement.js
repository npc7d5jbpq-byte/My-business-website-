(async function () {
  const params = new URLSearchParams(window.location.search);
  const apiBase = params.get('apiBase');

  const statementEl = document.getElementById('statement');
  const errorEl = document.getElementById('statement-error');

  document.getElementById('print-btn').addEventListener('click', () => window.print());
  document.getElementById('close-btn').addEventListener('click', () => window.close());

  function fail(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  // Every statement is one heading (the plot/entity/deal) plus one or more
  // "sections" - each its own party, its own price/paid/remaining summary,
  // and its own payment table. A colony plot or broker deal only ever has
  // one section (buyer, or broker). An agricultural/shops/commercial
  // record can have two: what was paid to the seller to acquire it, and
  // (once sold) what's been received from the buyer - both printed on the
  // same page so a full picture of the record's money doesn't need two
  // separate statements.
  async function loadStatementData() {
    if (apiBase === '/brokers') {
      const brokerId = params.get('brokerId');
      const dealId = params.get('dealId');
      const broker = await apiRequest(`/brokers/${brokerId}`);
      const deal = broker.deals.find((d) => d.id === dealId);
      if (!deal) throw new Error('That deal could not be found.');
      return {
        heading: deal.description,
        description: deal.dealValue ? `Deal value: ${formatCurrency(deal.dealValue)}${deal.commissionPercent ? ` · Commission: ${deal.commissionPercent}%` : ''}` : '',
        sections: [{
          sectionLabel: 'Deal', priceLabel: 'Total Commission',
          partyLabel: 'Broker', partyName: broker.name || '—', partySub: broker.phone || '',
          direction: 'paid',
          totalPrice: Number(deal.stats.commissionAmount) || 0,
          totalSettled: Number(deal.stats.totalPaid) || 0,
          remaining: Number(deal.stats.remaining) || 0,
          payments: deal.payments || [],
        }],
      };
    }

    if (apiBase === '/colonies') {
      const colonyId = params.get('colonyId');
      const plotId = params.get('plotId');
      const colony = await apiRequest(`/colonies/${colonyId}`);
      const plot = colony.plots.find((p) => p.id === plotId);
      if (!plot) throw new Error('That plot could not be found.');
      const descBits = [colony.name, plot.size, plot.category ? capitalize(plot.category) : null].filter(Boolean);
      return {
        heading: `Plot ${plot.plotNumber}`,
        description: descBits.join(' · '),
        sections: [{
          sectionLabel: 'Property', priceLabel: 'Total Price',
          partyLabel: 'Buyer', partyName: plot.buyerName || '—',
          partySub: [plot.buyerPhone, plot.buyerCnic ? `CNIC: ${plot.buyerCnic}` : null].filter(Boolean).join(' · '),
          direction: 'received',
          totalPrice: Number(plot.price) || 0,
          discount: Number(plot.discount) || 0,
          totalSettled: Number(plot.received) || 0,
          remaining: Number(plot.remaining) || 0,
          payments: plot.payments || [],
        }],
      };
    }

    const entityId = params.get('entityId');
    const entity = await apiRequest(`${apiBase}/${entityId}`);
    const descBits = [entity.location, entity.area].filter(Boolean);
    const paidPayments = (entity.payments || []).filter((p) => p.direction === 'paid');
    const receivedPayments = (entity.payments || []).filter((p) => p.direction === 'received');
    const sections = [];
    // Purchase side (money paid to the seller) always exists - even a
    // record with a zero purchase price still shows the seller it came
    // from. Sale side only shows up once there's actually a buyer/sale on
    // record (matches "Mark Sold" having been used), so an unsold record
    // doesn't print an empty, confusing "Received from Buyer" section.
    sections.push({
      sectionLabel: 'Property', priceLabel: 'Purchase Price',
      partyLabel: 'Seller', partyName: entity.sellerName || '—', partySub: entity.sellerPhone || '',
      direction: 'paid',
      totalPrice: Number(entity.purchasePrice) || 0,
      totalSettled: Number(entity.stats.totalPaid) || 0,
      remaining: Number(entity.stats.totalPayable) || 0,
      payments: paidPayments,
    });
    if (entity.buyerName || entity.salePrice || receivedPayments.length) {
      sections.push({
        sectionLabel: 'Sale', priceLabel: 'Sale Price',
        partyLabel: 'Buyer', partyName: entity.buyerName || '—', partySub: entity.buyerPhone || '',
        direction: 'received',
        totalPrice: Number(entity.salePrice) || 0,
        discount: Number(entity.discount) || 0,
        totalSettled: Number(entity.stats.totalReceived) || 0,
        remaining: Number(entity.stats.totalReceivable) || 0,
        payments: receivedPayments,
      });
    }
    return { heading: entity.title, description: descBits.join(' · '), sections };
  }

  function rowStatus(p, direction) {
    if (p.status === 'rescheduled') return { cls: 's-row-rescheduled', label: '<span class="s-status-rescheduled">Missed — Rescheduled</span>' };
    if (p.paidDate) return { cls: '', label: `<span class="s-status-paid">${direction === 'paid' ? 'Paid' : 'Received'}</span>` };
    const overdue = p.dueDate && new Date(p.dueDate) < new Date(new Date().toISOString().slice(0, 10));
    return { cls: 's-row-pending', label: overdue ? '<span class="s-status-overdue">Overdue</span>' : '<span class="s-status-pending">Pending</span>' };
  }

  function sectionHtml(section) {
    const { payments, direction } = section;
    const sorted = payments.slice().sort((a, b) => new Date(a.dueDate || a.paidDate || 0) - new Date(b.dueDate || b.paidDate || 0));
    const rowsHtml = sorted.length ? sorted.map((p) => {
      const st = rowStatus(p, direction);
      const methodBits = [paymentMethodLabel(p), paidByLabel(p)].filter(Boolean).join(' · ');
      return `
        <tr class="${st.cls}">
          <td>${escapeHtml(formatDate(p.dueDate))}</td>
          <td>${p.paidDate ? escapeHtml(formatDate(p.paidDate)) : '—'}</td>
          <td>${st.label}</td>
          <td>${escapeHtml(methodBits || '—')}</td>
          <td>${escapeHtml(p.notes || '')}</td>
          <td class="text-right" style="font-weight:700;">${formatCurrency(p.amount)}</td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:16px;">No payment history recorded yet.</td></tr>';

    return `
      <div class="s-info-grid">
        <div class="s-info-box">
          <div class="s-info-label">${escapeHtml((section.sectionLabel || '').toUpperCase())} TRANSACTION</div>
          <div class="s-info-name">${escapeHtml(section.priceLabel)}: ${formatCurrency(section.totalPrice)}</div>
          ${section.discount ? `<div class="s-info-sub">Discount given: Rs. ${formatCurrency(section.discount).replace('Rs. ', '')} (list price was ${formatCurrency(section.totalPrice + section.discount)})</div>` : ''}
        </div>
        <div class="s-info-box">
          <div class="s-info-label">${escapeHtml(section.partyLabel.toUpperCase())}</div>
          <div class="s-info-name">${escapeHtml(section.partyName)}</div>
          ${section.partySub ? `<div class="s-info-sub">${escapeHtml(section.partySub)}</div>` : ''}
        </div>
      </div>

      <div class="s-summary">
        <div class="s-summary-card"><div class="lbl">${escapeHtml(section.priceLabel)}</div><div class="val">${formatCurrency(section.totalPrice)}</div></div>
        <div class="s-summary-card"><div class="lbl">${direction === 'paid' ? 'Total Paid' : 'Total Received'}</div><div class="val" style="color:var(--success);">${formatCurrency(section.totalSettled)}</div></div>
        <div class="s-summary-card"><div class="lbl">Balance Due</div><div class="val" style="color:${section.remaining > 0 ? 'var(--danger)' : 'var(--success)'};">${formatCurrency(section.remaining)}</div></div>
      </div>

      <table class="s-table">
        <thead><tr><th>Due Date</th><th>${direction === 'paid' ? 'Paid Date' : 'Received Date'}</th><th>Status</th><th>Paid Through</th><th>Notes</th><th class="text-right">Amount</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      <div class="s-totals">
        <div class="s-totals-box">
          ${section.discount ? `
            <div class="s-totals-row"><span>List Price</span><span>${formatCurrency(section.totalPrice + section.discount)}</span></div>
            <div class="s-totals-row"><span>Discount Given</span><span>− ${formatCurrency(section.discount)}</span></div>
          ` : ''}
          <div class="s-totals-row"><span>${escapeHtml(section.priceLabel)}${section.discount ? ' (after discount)' : ''}</span><span>${formatCurrency(section.totalPrice)}</span></div>
          <div class="s-totals-row"><span>${direction === 'paid' ? 'Total Paid to Date' : 'Total Received to Date'}</span><span>${formatCurrency(section.totalSettled)}</span></div>
          <div class="s-totals-row grand"><span>Balance Due</span><span>${formatCurrency(section.remaining)}</span></div>
        </div>
      </div>

      <div class="s-sig-row">
        <div class="s-sig"><div class="s-sig-line">${escapeHtml(section.partyLabel)} Signature</div></div>
        <div class="s-sig"><div class="s-sig-line">Authorized Signature (Gulberg City Office)</div></div>
      </div>
    `;
  }

  function render(data) {
    const printedAt = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    statementEl.innerHTML = `
      <div class="s-header">
        <div>
          <div class="s-brand-name">GULBERG CITY OFFICE</div>
          <div class="s-brand-tag">Property Record &amp; Ledger System</div>
        </div>
        <div class="s-title">
          <div class="t1">FULL STATEMENT</div>
          <div class="t2">Printed ${escapeHtml(printedAt)}</div>
        </div>
      </div>

      <div class="s-info-box" style="margin-bottom:20px;">
        <div class="s-info-label">RECORD</div>
        <div class="s-info-name" style="font-size:16px;">${escapeHtml(data.heading)}</div>
        ${data.description ? `<div class="s-info-sub">${escapeHtml(data.description)}</div>` : ''}
      </div>

      ${data.sections.map((s, i) => `
        ${i > 0 ? '<hr class="r-rule" style="border:none; border-top:2px dashed var(--rule); margin:26px 0;" />' : ''}
        ${sectionHtml(s)}
      `).join('')}

      <div class="s-footer-note">This statement lists every installment on record — paid and pending — as of the print date above. Generated on request; not valid without an office stamp/signature for legal use.</div>

      <div class="s-generated">* * * Computer-generated statement from the Gulberg City Office record system * * *</div>
    `;
    statementEl.hidden = false;
  }

  try {
    if (!apiBase) throw new Error('Missing information needed to build this statement.');
    const data = await loadStatementData();
    render(data);
  } catch (err) {
    fail(err.message || 'Could not load this statement.');
  }
})();
