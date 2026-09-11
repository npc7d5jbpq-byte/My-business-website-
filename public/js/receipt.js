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
    if (apiBase === '/brokers') {
      const brokerId = params.get('brokerId');
      const dealId = params.get('dealId');
      const broker = await apiRequest(`/brokers/${brokerId}`);
      const deal = broker.deals.find((d) => d.id === dealId);
      if (!deal) throw new Error('That deal could not be found.');
      const payment = deal.payments.find((p) => p.id === paymentId);
      if (!payment) throw new Error('That payment could not be found.');
      return {
        heading: deal.description,
        description: deal.dealValue ? `Deal value: ${formatCurrency(deal.dealValue)}` : '',
        sectionLabel: 'Deal',
        priceLabel: 'Total Commission',
        partyLabel: 'Paid To (Broker)',
        partyName: broker.name || '—',
        partyPhone: broker.phone || '',
        direction: 'paid',
        totalPrice: Number(deal.stats.commissionAmount) || 0,
        totalSettled: Number(deal.stats.totalPaid) || 0,
        remaining: Number(deal.stats.remaining) || 0,
        payment,
      };
    }

    if (apiBase === '/people') {
      const personId = params.get('personId');
      const dealId = params.get('dealId');
      const person = await apiRequest(`/people/${personId}`);
      const deal = person.deals.find((d) => d.id === dealId);
      if (!deal) throw new Error('That deal could not be found.');
      const payment = deal.payments.find((p) => p.id === paymentId);
      if (!payment) throw new Error('That payment could not be found.');
      const isPayable = deal.direction === 'payable';
      return {
        heading: deal.description,
        description: '',
        sectionLabel: 'Deal',
        priceLabel: 'Deal Amount',
        partyLabel: isPayable ? 'Paid To' : 'Received From',
        partyName: person.name || '—',
        partyPhone: person.phone || '',
        direction: isPayable ? 'paid' : 'received',
        totalPrice: Number(deal.stats.amount) || 0,
        totalSettled: Number(deal.stats.totalPaid) || 0,
        remaining: Number(deal.stats.remaining) || 0,
        payment,
      };
    }

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
        discount: Number(plot.discount) || 0,
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
      discount: direction === 'received' ? Number(entity.discount) || 0 : 0,
      totalSettled: Number(direction === 'paid' ? entity.stats.totalPaid : entity.stats.totalReceived) || 0,
      remaining: Number(direction === 'paid' ? entity.stats.totalPayable : entity.stats.totalReceivable) || 0,
      payment,
    };
  }

  function render(data) {
    const { payment, direction } = data;
    const isPaid = Boolean(payment.paidDate);
    const printedAt = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    receiptEl.innerHTML = `
      <div class="r-center">
        <div class="r-brand-name">GULBERG CITY OFFICE</div>
        <div class="r-brand-tag">Property Record &amp; Ledger System</div>
        <div class="r-title">PAYMENT RECEIPT</div>
      </div>
      <hr class="r-rule" />

      <div class="r-row"><span>Receipt No</span><span class="v">${escapeHtml(shortReceiptNo(payment.id))}</span></div>
      <div class="r-row"><span>Date</span><span class="v">${escapeHtml(formatDate(payment.paidDate || payment.dueDate))}</span></div>
      <div class="r-row"><span>Printed</span><span class="v">${escapeHtml(printedAt)}</span></div>
      <hr class="r-rule" />

      <div class="r-section-title">${escapeHtml(data.partyLabel.toUpperCase())}</div>
      <div class="r-party-name">${escapeHtml(data.partyName)}</div>
      ${data.partyPhone ? `<div class="r-party-sub">${escapeHtml(data.partyPhone)}</div>` : ''}
      <hr class="r-rule" />

      <div class="r-section-title">${escapeHtml((data.sectionLabel || 'Property').toUpperCase())}</div>
      <div class="r-party-name" style="font-size:12px;">${escapeHtml(data.heading)}</div>
      ${data.description ? `<div class="r-party-sub">${escapeHtml(data.description)}</div>` : ''}
      <hr class="r-rule" />

      <div class="r-item">
        <div class="r-item-desc">${escapeHtml(payment.notes || (direction === 'paid' ? 'Payment made' : 'Payment received'))}</div>
        <div class="r-item-status">${isPaid ? '[ PAID ]' : `[ PENDING${payment.dueDate ? ' - due ' + formatDate(payment.dueDate) : ''} ]`}</div>
        ${paymentMethodLabel(payment) ? `<div class="r-item-status" style="font-weight:400;">Paid Through: ${escapeHtml(paymentMethodLabel(payment))}</div>` : ''}
        ${paidByLabel(payment) ? `<div class="r-item-status" style="font-weight:400;">${escapeHtml(paidByLabel(payment))}</div>` : ''}
        <div class="r-item-amt">${direction === 'paid' ? '-' : '+'} ${formatCurrency(payment.amount)}</div>
      </div>
      <hr class="r-rule" />

      ${data.discount ? `<div class="r-summary-row"><span>List Price</span><span>${formatCurrency(data.totalPrice + data.discount)}</span></div>
      <div class="r-summary-row"><span>Discount Given</span><span>- ${formatCurrency(data.discount)}</span></div>` : ''}
      <div class="r-summary-row"><span>${escapeHtml(data.priceLabel || 'Total Price')}</span><span>${formatCurrency(data.totalPrice)}</span></div>
      <div class="r-summary-row"><span>${direction === 'paid' ? 'Total Paid to Date' : 'Total Received to Date'}</span><span>${formatCurrency(data.totalSettled)}</span></div>
      <hr class="r-rule solid" />
      <div class="r-summary-row remaining"><span>Balance Due</span><span>${formatCurrency(data.remaining)}</span></div>

      <div class="r-sig">
        <div class="r-sig-line"></div>Received By
        <div class="r-sig-line"></div>Authorized Signature (Gulberg City Office)
      </div>

      <div class="r-footer">
        <div class="stars">* * *</div>
        This is a computer-generated receipt<br />from the Gulberg City Office record system.
      </div>
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
