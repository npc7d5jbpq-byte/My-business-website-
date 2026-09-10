(async function () {
  const params = new URLSearchParams(window.location.search);
  const apiBase = params.get('apiBase');
  const paymentId = params.get('paymentId');

  const receiptEl = document.getElementById('receipt');
  const errorEl = document.getElementById('receipt-error');

  document.getElementById('print-btn').addEventListener('click', () => window.print());
  document.getElementById('close-btn').addEventListener('click', () => window.close());

  function fail(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  function shortReceiptNo(id) {
    return (id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  }

  // Builds the data the template needs, whichever module the payment
  // belongs to - a colony plot (nested under a colony, no direction on its
  // payments - always money received from the buyer) or one of the
  // agricultural/shops/commercial records (its own payments with a
  // paid/received direction).
  async function loadReceiptData() {
    if (apiBase === '/colonies') {
      const colonyId = params.get('colonyId');
      const plotId = params.get('plotId');
      const colony = await apiRequest(`/colonies/${colonyId}`);
      const plot = colony.plots.find((p) => p.id === plotId);
      if (!plot) throw new Error('That plot could not be found.');
      const payment = plot.payments.find((p) => p.id === paymentId);
      if (!payment) throw new Error('That payment could not be found.');
      const descBits = [colony.name, plot.size, plot.category ? capitalize(plot.category) : null].filter(Boolean);
      return {
        heading: `Plot ${plot.plotNumber}`,
        description: descBits.join(' · '),
        partyLabel: 'Received From (Buyer)',
        partyName: plot.buyerName || '—',
        partyPhone: plot.buyerPhone || '',
        direction: 'received',
        totalPrice: Number(plot.price) || 0,
        totalSettled: Number(plot.received) || 0,
        remaining: Number(plot.remaining) || 0,
        payment,
      };
    }

    const entityId = params.get('entityId');
    const entity = await apiRequest(`${apiBase}/${entityId}`);
    const payment = (entity.payments || []).find((p) => p.id === paymentId);
    if (!payment) throw new Error('That payment could not be found.');
    const direction = payment.direction;
    const descBits = [entity.location, entity.area].filter(Boolean);
    return {
      heading: entity.title,
      description: descBits.join(' · '),
      partyLabel: direction === 'paid' ? 'Paid To (Seller)' : 'Received From (Buyer)',
      partyName: (direction === 'paid' ? entity.sellerName : entity.buyerName) || '—',
      partyPhone: (direction === 'paid' ? entity.sellerPhone : entity.buyerPhone) || '',
      direction,
      totalPrice: Number(direction === 'paid' ? entity.purchasePrice : entity.salePrice) || 0,
      totalSettled: Number(direction === 'paid' ? entity.stats.totalPaid : entity.stats.totalReceived) || 0,
      remaining: Number(direction === 'paid' ? entity.stats.totalPayable : entity.stats.totalReceivable) || 0,
      payment,
    };
  }

  function render(data) {
    const { payment, direction } = data;
    const isPaid = Boolean(payment.paidDate);
    const amountClass = direction === 'paid' ? 'amt-out' : 'amt-in';

    receiptEl.innerHTML = `
      <div class="r-header">
        <div class="r-brand">
          <div class="r-logo">GCO</div>
          <div class="r-brand-text">
            <strong>Gulberg City Office</strong>
            <span>Property Record &amp; Ledger System</span>
          </div>
        </div>
        <div class="r-meta">
          <div class="r-title">PAYMENT RECEIPT</div>
          <div class="r-line">Receipt No: <strong>${escapeHtml(shortReceiptNo(payment.id))}</strong></div>
          <div class="r-line">Date: <strong>${escapeHtml(formatDate(payment.paidDate || payment.dueDate))}</strong></div>
          <div class="r-line">Printed: ${escapeHtml(new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</div>
        </div>
      </div>

      <div class="r-section">
        <div class="r-section-title">${escapeHtml(data.partyLabel)}</div>
        <div class="r-party-name">${escapeHtml(data.partyName)}</div>
        ${data.partyPhone ? `<div class="r-party-sub">${escapeHtml(data.partyPhone)}</div>` : ''}
      </div>

      <div class="r-section">
        <div class="r-section-title">Property</div>
        <div class="r-party-name" style="font-size:14.5px;">${escapeHtml(data.heading)}</div>
        ${data.description ? `<div class="r-party-sub">${escapeHtml(data.description)}</div>` : ''}
      </div>

      <table class="r-table">
        <thead><tr><th>Description</th><th style="text-align:right;">Amount</th></tr></thead>
        <tbody>
          <tr>
            <td>${escapeHtml(payment.notes || (direction === 'paid' ? 'Payment made' : 'Payment received'))}
              <div style="margin-top:3px;"><span class="r-status ${isPaid ? 'paid' : 'pending'}">${isPaid ? 'PAID' : `PENDING${payment.dueDate ? ' · due ' + formatDate(payment.dueDate) : ''}`}</span></div>
            </td>
            <td class="amt ${amountClass}" style="font-weight:700;">${formatCurrency(payment.amount)}</td>
          </tr>
        </tbody>
      </table>

      <div class="r-summary">
        <div class="r-summary-row total"><span>Total Price</span><span class="amt">${formatCurrency(data.totalPrice)}</span></div>
        <div class="r-summary-row"><span>${direction === 'paid' ? 'Total Paid to Date' : 'Total Received to Date'}</span><span class="amt ${amountClass}">${formatCurrency(data.totalSettled)}</span></div>
        <div class="r-summary-row remaining"><span>Remaining Balance</span><span class="amt">${formatCurrency(data.remaining)}</span></div>
      </div>

      <div class="r-signatures">
        <div class="r-sig"><div class="line"></div><div class="label">Received By</div></div>
        <div class="r-sig"><div class="line"></div><div class="label">Authorized Signature (Gulberg City Office)</div></div>
      </div>

      <div class="r-footer-note">This is a computer-generated receipt from the Gulberg City Office record system.</div>
    `;
    receiptEl.hidden = false;
  }

  try {
    if (!apiBase || !paymentId) throw new Error('Missing information needed to build this receipt.');
    const data = await loadReceiptData();
    render(data);
  } catch (err) {
    fail(err.message || 'Could not load this receipt.');
  }
})();
