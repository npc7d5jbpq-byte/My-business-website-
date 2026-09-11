// Shared helpers used by every page: API calls, the sidebar/topbar shell,
// a small generic modal-form system, and formatting utilities.

// Registers the service worker (see sw.js) so the app is installable to a
// phone's home screen and repeat loads of the static shell are faster.
// Harmless no-op in the desktop app / any browser without SW support.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* not critical */ });
  });
}

async function apiRequest(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  if (res.status === 401) {
    window.location.href = 'login.html';
    throw new Error('Not authenticated');
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* empty body is fine */
  }

  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

function formatCurrency(amount) {
  const n = Number(amount) || 0;
  const sign = n < 0 ? '-' : '';
  return `${sign}Rs. ${Math.abs(n).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// A clickable name -> the Unified Person View (person.html), used anywhere
// a buyer/seller/broker name is shown so their whole history with the
// office (across every module) is one click away. Falls back to plain
// escaped text when there's no name to link.
function personLink(name) {
  const n = (name || '').trim();
  if (!n) return escapeHtml(name || '');
  return `<a href="person.html?name=${encodeURIComponent(n)}" class="person-link">${escapeHtml(n)}</a>`;
}

function statusBadge(status) {
  const map = {
    available: 'badge-info',
    reserved: 'badge-warning',
    sold: 'badge-success',
    owned: 'badge-info',
    pending: 'badge-warning',
    completed: 'badge-success',
    cancelled: 'badge-danger',
  };
  const cls = map[status] || 'badge-muted';
  return `<span class="badge ${cls}">${escapeHtml(status || '')}</span>`;
}

const NAV_ITEMS = [
  { href: 'index.html', label: 'Dashboard', icon: '&#9632;' },
  { href: 'colonies.html', label: 'Commercial Colonies', icon: '&#9673;' },
  { href: 'agricultural.html', label: 'Agricultural Land', icon: '&#127807;' },
  { href: 'shops.html', label: 'Shops', icon: '&#127978;' },
  { href: 'commercial.html', label: 'Commercial Land & Plots', icon: '&#127970;' },
  { href: 'brokers.html', label: 'Brokers Commission', icon: '&#129309;' },
  { href: 'people.html', label: 'People', icon: '&#128101;' },
  { href: 'reports.html', label: 'Reports & Ledger', icon: '&#128202;' },
  { href: 'backups.html', label: 'Backups & Restore', icon: '&#128190;' },
  { href: 'account.html', label: 'Account Settings', icon: '&#128100;' },
];

async function initShell(activeHref) {
  let session;
  try {
    session = await apiRequest('/session');
  } catch (e) {
    window.location.href = 'login.html';
    return null;
  }
  if (!session.authenticated) {
    window.location.href = 'login.html';
    return null;
  }

  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.innerHTML = `
      <div class="brand">
        <div class="brand-mark">GCO</div>
        <div class="brand-text">
          <strong>Gulberg City Office</strong>
          <span>Property Record System</span>
        </div>
      </div>
      <nav class="nav">
        ${NAV_ITEMS.map((item) => `
          <a href="${item.href}" class="nav-link${item.href === activeHref ? ' active' : ''}">
            <span class="nav-icon">${item.icon}</span> ${item.label}
          </a>`).join('')}
      </nav>
    `;
  }

  const topbar = document.getElementById('topbar');
  if (topbar) {
    topbar.innerHTML = `
      <div class="topbar-title" id="topbar-title"></div>
      <div class="topbar-search" id="topbar-search">
        <input type="text" id="global-search-input" placeholder="Search a name, CNIC, phone, or plot number…" autocomplete="off" />
        <div class="search-results" id="global-search-results" hidden></div>
      </div>
      <div class="topbar-user">
        <span>Signed in as <strong>${escapeHtml(session.username || '')}</strong></span>
        <button class="btn btn-ghost" id="logout-btn">Log out</button>
      </div>
    `;
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await apiRequest('/logout', { method: 'POST' });
      window.location.href = 'login.html';
    });
    wireGlobalSearch();
  }

  return session;
}

// One search box, everywhere. Debounced so it doesn't fire an API call on
// every keystroke, and closes on outside click / Escape / picking a result.
function wireGlobalSearch() {
  const input = document.getElementById('global-search-input');
  const results = document.getElementById('global-search-results');
  if (!input || !results) return;
  let debounceTimer = null;
  let requestToken = 0;

  function hide() {
    results.hidden = true;
    results.innerHTML = '';
  }

  function render(items) {
    if (!items.length) {
      results.innerHTML = '<div class="search-empty">No matches. Try a different name, CNIC, phone number, or plot number.</div>';
      results.hidden = false;
      return;
    }
    results.innerHTML = items.map((r) => `
      <a class="search-result-item" href="${r.url}">
        <div class="sr-label">${escapeHtml(r.label)}</div>
        ${r.sublabel ? `<div class="sr-meta">${escapeHtml(r.sublabel)}</div>` : ''}
        <div class="sr-module">${escapeHtml(r.module)}</div>
      </a>
    `).join('');
    results.hidden = false;
  }

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(debounceTimer);
    if (q.length < 2) { hide(); return; }
    debounceTimer = setTimeout(async () => {
      const token = ++requestToken;
      try {
        const data = await apiRequest(`/search?q=${encodeURIComponent(q)}`);
        if (token !== requestToken) return; // a newer keystroke already superseded this request
        render(data.results || []);
      } catch (e) {
        if (token !== requestToken) return;
        hide();
      }
    }, 250);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2 && results.innerHTML) results.hidden = false;
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#topbar-search')) hide();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hide(); input.blur(); }
  });
}

// ---- Document attachments (scanned CNIC, sale agreement, registry copy,
// etc.) attached directly to a colony/plot/agricultural-shop-commercial
// record/broker/person ----

function attachmentIcon(mimeType) {
  if (/^image\//.test(mimeType || '')) return '🖼️';
  if (mimeType === 'application/pdf') return '📄';
  return '📎';
}

function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Renders a self-contained "Documents" section (a list of what's attached
// plus an upload form) into the given container element, for one record.
// Re-run it (it re-renders in place) after an upload/delete to refresh.
async function renderAttachmentsSection(containerId, parentType, parentId) {
  const container = document.getElementById(containerId);
  if (!container || !parentId) return;
  container.innerHTML = '<div class="text-muted" style="font-size:12.5px;">Loading documents…</div>';
  let rows = [];
  try {
    rows = await apiRequest(`/attachments?parentType=${encodeURIComponent(parentType)}&parentId=${encodeURIComponent(parentId)}`);
  } catch (err) {
    container.innerHTML = `<div class="text-muted" style="font-size:12.5px;">Could not load documents: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const listHtml = rows.length ? rows.map((a) => `
    <div class="attachment-card">
      <a href="/api/attachments/${a.id}/file" target="_blank" rel="noopener" class="attachment-link" title="${escapeHtml(a.originalName)}">
        <span class="attachment-icon">${attachmentIcon(a.mimeType)}</span>
        <span class="attachment-name">${escapeHtml(a.label || a.originalName)}</span>
      </a>
      <span class="attachment-meta">${formatFileSize(a.size)} · ${formatDate(a.createdAt)}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-delete-attachment="${a.id}">Delete</button>
    </div>
  `).join('') : '<div class="text-muted" style="font-size:12.5px; margin-bottom:10px;">No documents attached yet.</div>';

  container.innerHTML = `
    <div class="attachment-list">${listHtml}</div>
    <form class="attachment-upload-form" id="${containerId}-upload-form">
      <input type="file" name="file" required />
      <input type="text" name="label" placeholder="Label (e.g. CNIC front, Sale agreement, Registry copy)" />
      <button type="submit" class="btn btn-accent btn-sm">+ Attach Document</button>
    </form>
    <div class="modal-error" id="${containerId}-upload-error" hidden></div>
  `;

  container.querySelectorAll('[data-delete-attachment]').forEach((btn) => {
    btn.addEventListener('click', withButtonBusy(btn, async () => {
      if (!confirm('Delete this document? This cannot be undone.')) return;
      try {
        await apiRequest(`/attachments/${btn.dataset.deleteAttachment}`, { method: 'DELETE' });
        renderAttachmentsSection(containerId, parentType, parentId);
      } catch (err) { showBanner(err.message); }
    }));
  });

  const form = document.getElementById(`${containerId}-upload-form`);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById(`${containerId}-upload-error`);
    const submitBtn = form.querySelector('button[type="submit"]');
    const fileInput = form.querySelector('input[type="file"]');
    if (!fileInput.files[0]) return;
    setButtonLoading(submitBtn, true, 'Uploading…');
    errBox.hidden = true;
    try {
      const fd = new FormData(form);
      fd.set('parentType', parentType);
      fd.set('parentId', parentId);
      // Uses fetch directly (not apiRequest) - a file upload is
      // multipart/form-data, not the JSON body apiRequest always sends.
      const res = await fetch('/api/attachments', { method: 'POST', body: fd, credentials: 'include' });
      if (res.status === 401) { window.location.href = 'login.html'; return; }
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Upload failed (${res.status}).`);
      renderAttachmentsSection(containerId, parentType, parentId);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
      setButtonLoading(submitBtn, false);
    }
  });
}

function setPageTitle(title) {
  const el = document.getElementById('topbar-title');
  if (el) el.textContent = title;
  document.title = `${title} — Gulberg City Office`;
}

// ---- Generic modal / form system ----

function closeModal() {
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
}

function fieldHtml(field) {
  const value = field.value != null ? field.value : '';
  const req = field.required ? 'required' : '';
  if (field.type === 'select') {
    return `
      <label class="field">
        <span>${escapeHtml(field.label)}</span>
        <select name="${field.name}" ${req}>
          ${field.options.map((o) => `<option value="${escapeHtml(o.value)}" ${o.value === value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
        </select>
      </label>`;
  }
  if (field.type === 'textarea') {
    return `
      <label class="field field-wide">
        <span>${escapeHtml(field.label)}</span>
        <textarea name="${field.name}" rows="3" placeholder="${escapeHtml(field.placeholder || '')}">${escapeHtml(value)}</textarea>
      </label>`;
  }
  return `
    <label class="field">
      <span>${escapeHtml(field.label)}</span>
      <input
        type="${field.type || 'text'}"
        name="${field.name}"
        value="${escapeHtml(value)}"
        placeholder="${escapeHtml(field.placeholder || '')}"
        ${field.step ? `step="${field.step}"` : ''}
        ${req}
      />
    </label>`;
}

// options: { title, fields, submitLabel, onSubmit(values) -> Promise }
function openFormModal(options) {
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>${escapeHtml(options.title)}</h3>
          <button class="modal-close" type="button" aria-label="Close">&times;</button>
        </div>
        <form class="modal-body" id="modal-form">
          <div class="field-grid">
            ${options.fields.map(fieldHtml).join('')}
          </div>
          <div class="modal-error" id="modal-error" hidden></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" id="modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary" id="modal-submit">${escapeHtml(options.submitLabel || 'Save')}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const overlay = root.querySelector('.modal-overlay');
  const form = root.querySelector('#modal-form');
  const errorBox = root.querySelector('#modal-error');
  const submitBtn = root.querySelector('#modal-submit');

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closeModal();
  });
  root.querySelector('.modal-close').addEventListener('click', closeModal);
  root.querySelector('#modal-cancel').addEventListener('click', closeModal);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = {};
    for (const field of options.fields) {
      values[field.name] = form.elements[field.name].value;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';
    errorBox.hidden = true;
    try {
      await options.onSubmit(values);
      // Lets onSubmit chain straight into a follow-up modal (e.g. Mark Sold
      // -> Create Installment Plan) without this auto-close racing it and
      // wiping out whatever onSubmit just opened.
      if (!options.keepModalOpen) closeModal();
    } catch (err) {
      errorBox.textContent = err.message || 'Something went wrong.';
      errorBox.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = options.submitLabel || 'Save';
    }
  });
}

// A more free-form modal for cases that aren't a single simple form (e.g. a
// payment history list with an "add payment" form underneath it).
// `mount(root)` runs after the shell is in the DOM so the caller can wire up
// its own handlers and re-render the body whenever it wants.
function openCustomModal(title, bodyHtml, mount) {
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>${escapeHtml(title)}</h3>
          <button class="modal-close" type="button" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body" id="custom-modal-body">${bodyHtml}</div>
      </div>
    </div>
  `;
  const overlay = root.querySelector('.modal-overlay');
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closeModal();
  });
  root.querySelector('.modal-close').addEventListener('click', closeModal);
  if (mount) mount(root.querySelector('#custom-modal-body'));
}

function showBanner(message, type = 'error') {
  const el = document.getElementById('page-banner');
  if (!el) {
    // eslint-disable-next-line no-alert
    alert(message);
    return;
  }
  el.textContent = message;
  el.className = `banner banner-${type}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 5000);
}

// ---- Animation helpers ----
// Kept deliberately restrained: small movements, short durations, and every
// one of them respects prefers-reduced-motion (the CSS rule in style.css
// collapses animation/transition durations globally for that).

const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Toggles a button between its normal label and a small inline spinner +
// loading label, used for Sign In and other actions that take a moment.
function setButtonLoading(button, loading, loadingLabel) {
  if (!button) return;
  if (loading) {
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="btn-spinner"></span><span>${escapeHtml(loadingLabel || 'Please wait…')}</span>`;
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
}

// Animates a number counting up from 0 to `value` inside `el`, formatting
// each frame with `formatFn` (defaults to formatCurrency). Skips straight
// to the final value when the user prefers reduced motion.
function animateCountUp(el, value, { duration = 700, formatFn = formatCurrency } = {}) {
  if (!el) return;
  const target = Number(value) || 0;
  if (prefersReducedMotion) {
    el.textContent = formatFn(target);
    return;
  }
  const start = performance.now();
  const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
  function tick(now) {
    const progress = Math.min(1, (now - start) / duration);
    const current = target * easeOutQuad(progress);
    el.textContent = formatFn(current);
    if (progress < 1) requestAnimationFrame(tick);
    else el.textContent = formatFn(target);
  }
  requestAnimationFrame(tick);
}

// Applies a small fade/lift-in stagger to a table's rows once they've been
// rendered, capping the per-row delay so long tables don't crawl in.
function staggerRows(tbody, { stepMs = 35, maxDelayMs = 300 } = {}) {
  if (!tbody) return;
  Array.from(tbody.children).forEach((row, i) => {
    row.classList.add('row-enter');
    row.style.animationDelay = `${Math.min(i * stepMs, maxDelayMs)}ms`;
  });
}

// A row of skeleton stat-tile placeholders, shown while a page's first
// data fetch is in flight instead of plain "Loading…" text.
function skeletonCards(count = 4) {
  return Array.from({ length: count }, () => `
    <div class="card skeleton-card">
      <div class="skeleton-block"></div>
      <div class="skeleton-block"></div>
      <div class="skeleton-block"></div>
    </div>
  `).join('');
}

// Skeleton table rows, shown while a list page's first data fetch is in
// flight.
function skeletonRows(count = 4, columns = 4) {
  const cells = Array.from({ length: columns }, () => '<td><div class="skeleton-block skeleton-line"></div></td>').join('');
  return Array.from({ length: count }, () => `<tr>${cells}</tr>`).join('');
}

// Animates .progress bars from 0 to their intended width once inserted -
// build them with data-width="NN" and width:0% inline, then call this.
function animateProgressBars(container) {
  const bars = (container || document).querySelectorAll('.progress > div[data-width]');
  requestAnimationFrame(() => {
    bars.forEach((bar) => { bar.style.width = `${bar.dataset.width}%`; });
  });
}

// Wraps a click handler so the button visibly disables itself (dims, per
// the existing .btn:disabled style) the instant it's clicked, and a repeat
// click while the first request is still in flight is simply ignored
// instead of firing a second request. This is what "I keep clicking and
// nothing happens" almost always turns out to be - no *visible* reaction
// to the first click - rather than the app actually being slow.
function withButtonBusy(button, fn) {
  return async (...args) => {
    if (!button || button.disabled) return;
    button.disabled = true;
    try {
      await fn(...args);
    } finally {
      button.disabled = false;
    }
  };
}

// ---- Installment plan builder ----
// Shared by the colony plot payments modal and the agricultural/shops/
// commercial payments modal: lets an upfront/bayana amount plus any number
// of follow-up installments be defined in one go (amount + either an exact
// due date or a quick "due after N months" that fills the date in for you),
// instead of adding each payment one at a time and hand-calculating dates.

// ---- Payment method (paid through / reference no. / bank) ----
// Shared by every "add a payment" form and the Mark Paid / installment-plan
// upfront section across colonies, agricultural/shops/commercial, and
// broker commissions - so the client can record whether a payment moved as
// cash, a pay order (and its number), or a cheque (and its number), plus
// which bank it went through.

const PAID_THROUGH_OPTIONS = [
  { value: '', label: '— Not specified —' },
  { value: 'cash', label: 'Cash' },
  { value: 'pay_order', label: 'Pay Order' },
  { value: 'cheque', label: 'Cheque' },
];

function paymentMethodFieldsHtml() {
  return `
    <label class="field"><span>Paid Through</span>
      <select name="paidThrough">
        ${PAID_THROUGH_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}
      </select>
    </label>
    <label class="field"><span>Pay Order / Cheque Number</span><input type="text" name="referenceNumber" placeholder="if applicable" /></label>
    <label class="field"><span>Bank Name</span><input type="text" name="bankName" placeholder="if applicable" /></label>
    <label class="field"><span>Paid By</span><input type="text" name="paidBy" placeholder="if different from the person on record - e.g. a relative paid on their behalf" /></label>
  `;
}

// A short display label for a payment row's method, e.g. "Pay Order #1234
// · HBL Bank" - empty string if nothing was recorded.
function paymentMethodLabel(p) {
  if (!p) return '';
  if (p.source === 'advance') return 'Offset from broker advance';
  const map = { cash: 'Cash', pay_order: 'Pay Order', cheque: 'Cheque' };
  const label = map[p.paidThrough];
  if (!label) return '';
  const bits = [label];
  if (p.referenceNumber) bits.push(`#${p.referenceNumber}`);
  if (p.bankName) bits.push(p.bankName);
  return bits.join(' · ');
}

// Who actually handed over/received the money, if different from the
// buyer/seller/broker the payment is filed under (e.g. a relative or
// business partner settling on someone else's behalf) - empty string if
// not recorded.
function paidByLabel(p) {
  return p && p.paidBy ? `Paid by ${p.paidBy}` : '';
}

// ---- Price-per-Marla calculator (colony plots + agricultural/shops/
// commercial records) ----
//
// Local size conventions: 1 Kanal = 20 Marla, 1 Acre = 160 Marla.
const SIZE_UNIT_TO_MARLA = { marla: 1, kanal: 20, acre: 160 };
const SIZE_UNIT_OPTIONS = [
  { value: 'marla', label: 'Marla' },
  { value: 'kanal', label: 'Kanal (= 20 Marla)' },
  { value: 'acre', label: 'Acre (= 160 Marla)' },
];

function toMarla(value, unit) {
  return (Number(value) || 0) * (SIZE_UNIT_TO_MARLA[unit] || 1);
}

// Best-effort fallback for records with no structured sizeValue/sizeUnit
// (older records, or ones entered via the free-text size/area field only)
// - reads a marla-equivalent straight out of text like "5 Marla" or
// "2 Kanal" or "10 Acres" wherever that pattern appears.
function parseSizeToMarla(text) {
  const m = String(text || '').match(/(\d+(?:\.\d+)?)\s*(marla|kanal|acre)/i);
  if (!m) return null;
  return Number(m[1]) * (SIZE_UNIT_TO_MARLA[m[2].toLowerCase()] || 1);
}

// The marla-equivalent size to use for a price-per-marla figure - prefers
// the structured sizeValue/sizeUnit fields, falls back to parsing the
// free-text size/area string for records that predate them.
function marlaEquivalentOf(record) {
  if (record && Number(record.sizeValue) > 0) return toMarla(record.sizeValue, record.sizeUnit || 'marla');
  return parseSizeToMarla(record && (record.size || record.area));
}

// Rs. per marla, computed fresh from a price field ÷ size (not read back
// from a stored pricePerMarla, which can go stale once price is edited by
// hand) - null when there's no size to divide by. Used for a side-by-side
// price/marla comparison across a colony's plots.
function pricePerMarlaOf(record, priceField) {
  const marla = marlaEquivalentOf(record);
  const price = Number(record && record[priceField]) || 0;
  if (!marla || marla <= 0 || !price) return null;
  return price / marla;
}

// Field descriptors (for openFormModal's `fields` array) for the "figure
// the price out for me" calculator: size (value + unit) x price per
// Marla, minus an optional discount. Spread these into a form's fields
// array right before the actual price field, then call
// wirePriceCalculator() after the modal opens to wire the live auto-fill.
function priceCalculatorFields(v) {
  v = v || {};
  return [
    { name: 'sizeValue', label: 'Size (for price calculator, optional)', type: 'number', step: '0.01', value: v.sizeValue || '' },
    { name: 'sizeUnit', label: 'Size Unit', type: 'select', value: v.sizeUnit || 'marla', options: SIZE_UNIT_OPTIONS },
    { name: 'pricePerMarla', label: 'Price per Marla (Rs., optional)', type: 'number', step: '0.01', value: v.pricePerMarla || '' },
    { name: 'discount', label: 'Discount (Rs., if given)', type: 'number', step: '0.01', value: v.discount || '' },
  ];
}

// Wires the calculator fields above to auto-fill a target price field
// (by name) inside the currently-open #modal-form, the same
// "auto-calculates but stays directly editable" pattern used for the
// broker commission % calculator. Call right after openFormModal()/
// openCustomModal() returns (both are synchronous, so the form already
// exists in the DOM by the time this runs).
function wirePriceCalculator(priceFieldName, formEl) {
  const form = formEl || document.getElementById('modal-form');
  if (!form || !form.elements.sizeValue || !form.elements[priceFieldName]) return;
  const recalc = () => {
    const sizeValue = Number(form.elements.sizeValue.value) || 0;
    const sizeUnit = form.elements.sizeUnit ? form.elements.sizeUnit.value : 'marla';
    const perMarla = Number(form.elements.pricePerMarla.value) || 0;
    const discount = Number(form.elements.discount.value) || 0;
    if (sizeValue > 0 && perMarla > 0) {
      const total = Math.max(0, toMarla(sizeValue, sizeUnit) * perMarla - discount);
      form.elements[priceFieldName].value = Math.round(total * 100) / 100;
    }
  };
  ['sizeValue', 'sizeUnit', 'pricePerMarla', 'discount'].forEach((name) => {
    if (form.elements[name]) form.elements[name].addEventListener('input', recalc);
  });
}

// Opens a small modal to record how/when a pending payment was actually
// settled. The point: the due date stays exactly as originally promised
// (never overwritten), and this only ever sets the *actual* date money
// changed hands - which is very often later than the due date - plus how
// it was paid. That way the record shows both: what was promised, and what
// actually happened, instead of losing the original date the moment a
// late payment is marked paid.
function openSettlePaymentModal({ title = 'Mark as Paid', defaultDate, includeMethod = true, onConfirm, onCancel }) {
  const dateVal = defaultDate || new Date().toISOString().slice(0, 10);
  openCustomModal(title, `
    <form id="settle-payment-form">
      <p class="text-muted" style="margin:0 0 14px; font-size:12.5px; line-height:1.6;">
        The due date stays on record as originally promised — this only sets the date the money
        actually changed hands, even if that's later (or earlier) than that.
      </p>
      <div class="field-grid">
        <label class="field"><span>Actual paid date</span><input type="date" name="paidDate" value="${dateVal}" required /></label>
        ${includeMethod ? paymentMethodFieldsHtml() : ''}
      </div>
      <div class="modal-error" id="settle-payment-error" hidden style="margin-top:14px;"></div>
      <div class="modal-actions" style="margin-top:16px;">
        <button type="button" class="btn btn-ghost" data-settle-cancel>Cancel</button>
        <button type="submit" class="btn btn-primary" id="settle-payment-submit">Confirm Paid</button>
      </div>
    </form>
  `, (root) => {
    root.querySelector('[data-settle-cancel]').addEventListener('click', () => { if (onCancel) onCancel(); });
    root.querySelector('#settle-payment-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const errBox = root.querySelector('#settle-payment-error');
      const btn = root.querySelector('#settle-payment-submit');
      setButtonLoading(btn, true, 'Saving…');
      try {
        await onConfirm({
          paidDate: form.elements.paidDate.value,
          paidThrough: includeMethod ? form.elements.paidThrough.value : undefined,
          referenceNumber: includeMethod ? form.elements.referenceNumber.value : undefined,
          bankName: includeMethod ? form.elements.bankName.value : undefined,
          paidBy: includeMethod ? form.elements.paidBy.value : undefined,
        });
      } catch (err) {
        errBox.textContent = err.message || 'Something went wrong.';
        errBox.hidden = false;
        setButtonLoading(btn, false);
      }
    });
  });
}

// Opens a small modal for the opposite situation to openSettlePaymentModal:
// an installment that was DUE but never actually changed hands on that
// date (either side "wasn't able to give or take" the money) and needs a
// new expected date instead. The original pending row is kept exactly as
// it was - marked so it reads as missed/rescheduled instead of "Pending",
// and dropped out of every pending/upcoming total - and a brand new
// pending row is created for the new date, so both the missed promise and
// the new one stay on record; nothing is ever deleted or silently
// overwritten. `onConfirm` receives { newDueDate, reason }.
function openRescheduleModal({ title = 'Reschedule Payment', originalDueDate, onConfirm, onCancel }) {
  openCustomModal(title, `
    <form id="reschedule-form">
      <p class="text-muted" style="margin:0 0 14px; font-size:12.5px; line-height:1.6;">
        This wasn't given or received on the date it was due${originalDueDate ? ` (${escapeHtml(formatDate(originalDueDate))})` : ''}.
        That stays on record as missed - nothing is deleted - and a new pending installment is
        created for whatever date it's now expected.
      </p>
      <div class="field-grid">
        <label class="field"><span>New expected date</span><input type="date" name="newDueDate" required /></label>
        <label class="field field-wide"><span>Reason / notes (optional)</span><input type="text" name="reason" placeholder="e.g. buyer asked for more time" /></label>
      </div>
      <div class="modal-error" id="reschedule-error" hidden style="margin-top:14px;"></div>
      <div class="modal-actions" style="margin-top:16px;">
        <button type="button" class="btn btn-ghost" data-reschedule-cancel>Cancel</button>
        <button type="submit" class="btn btn-primary" id="reschedule-submit">Confirm</button>
      </div>
    </form>
  `, (root) => {
    root.querySelector('[data-reschedule-cancel]').addEventListener('click', () => { if (onCancel) onCancel(); });
    root.querySelector('#reschedule-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const errBox = root.querySelector('#reschedule-error');
      const btn = root.querySelector('#reschedule-submit');
      setButtonLoading(btn, true, 'Saving…');
      try {
        await onConfirm({ newDueDate: form.elements.newDueDate.value, reason: form.elements.reason.value });
      } catch (err) {
        errBox.textContent = err.message || 'Something went wrong.';
        errBox.hidden = false;
        setButtonLoading(btn, false);
      }
    });
  });
}

function addMonthsToDate(dateStr, months) {
  const base = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(base.getTime())) return '';
  const d = new Date(base.getTime());
  d.setMonth(d.getMonth() + (Number(months) || 0));
  return d.toISOString().slice(0, 10);
}

// Same idea as addMonthsToDate but for short intervals (a broker's
// commission is often paid a handful of days apart, not months apart).
function addDaysToDate(dateStr, days) {
  const base = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(base.getTime())) return '';
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + (Number(days) || 0));
  return d.toISOString().slice(0, 10);
}

// `unit` picks whether each installment's quick-fill is "N months after"
// (land/plot sales - colonies, agricultural/shops/commercial) or "N days
// after" (broker commissions, which are typically settled within days/weeks
// of the deal rather than months).
function installmentPlanFormHtml({ includeDirection = false, unit = 'months' } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const unitWord = unit === 'days' ? 'days' : 'months';
  return `
    <p class="text-muted" style="margin:0 0 16px; font-size:12.5px; line-height:1.6;">
      Set the upfront amount, then add each remaining installment with its own amount -
      type how many ${unitWord} after the upfront it's due and the date fills in for you, or just pick
      a date directly.
    </p>
    ${includeDirection ? `
      <label class="field" style="margin-bottom:14px;">
        <span>Type</span>
        <select name="planDirection" required>
          <option value="paid">Paid to seller (money out)</option>
          <option value="received">Received from buyer (money in)</option>
        </select>
      </label>` : ''}
    <div class="field-grid" style="margin-bottom:6px;">
      <label class="field"><span>Upfront / Bayana amount (Rs.)</span><input type="number" step="0.01" name="planUpfrontAmount" placeholder="e.g. 20" /></label>
      <label class="field"><span>Upfront / Bayana date</span><input type="date" name="planUpfrontDate" value="${today}" /></label>
      ${paymentMethodFieldsHtml()}
    </div>
    <div style="margin:16px 0 8px; font-weight:700; font-size:13px;">Installments</div>
    <div data-installment-rows></div>
    <button type="button" class="btn btn-ghost btn-sm" data-add-installment-row>+ Add Installment</button>
    <div class="modal-error" id="plan-error" hidden style="margin-top:16px;"></div>
    <div class="modal-actions" style="margin-top:16px;">
      <button type="button" class="btn btn-ghost" data-plan-cancel>Cancel</button>
      <button type="submit" class="btn btn-primary" data-plan-submit>Create Plan</button>
    </div>
  `;
}

function installmentRowHtml(unit = 'months') {
  const unitLabel = unit === 'days' ? 'After (days)' : 'After (months)';
  return `
    <div class="installment-row" data-installment-row style="display:grid; grid-template-columns:1.2fr 1fr 1.2fr auto; gap:8px; margin-bottom:8px; align-items:end;">
      <label class="field" style="margin:0;"><span>Amount (Rs.)</span><input type="number" step="0.01" class="inst-amount" placeholder="e.g. 30" /></label>
      <label class="field" style="margin:0;"><span>${unitLabel}</span><input type="number" min="0" step="1" class="inst-months" placeholder="e.g. 1" /></label>
      <label class="field" style="margin:0;"><span>Due date</span><input type="date" class="inst-duedate" /></label>
      <button type="button" class="btn btn-ghost btn-sm" data-remove-row title="Remove">&times;</button>
    </div>
  `;
}

// Wires up "+ Add Installment" / remove-row / auto-fill-the-date behaviour
// for a plan form already inserted into `root`. Starts with two rows
// pre-added, since a plan is rarely just one installment. `unit` matches
// whatever was passed to installmentPlanFormHtml (months or days).
function initInstallmentPlanRows(root, unit = 'months') {
  const rowsContainer = root.querySelector('[data-installment-rows]');
  const upfrontDateInput = root.querySelector('[name=planUpfrontDate]');
  const addToDate = unit === 'days' ? addDaysToDate : addMonthsToDate;

  function addRow() {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = installmentRowHtml(unit);
    const rowEl = wrapper.firstElementChild;
    rowsContainer.appendChild(rowEl);
    const monthsInput = rowEl.querySelector('.inst-months');
    const dueDateInput = rowEl.querySelector('.inst-duedate');
    monthsInput.addEventListener('input', () => {
      if (monthsInput.value !== '') {
        dueDateInput.value = addToDate(upfrontDateInput.value, monthsInput.value);
      }
    });
    rowEl.querySelector('[data-remove-row]').addEventListener('click', () => rowEl.remove());
  }

  root.querySelector('[data-add-installment-row]').addEventListener('click', addRow);
  addRow();
  addRow();
}

// Reads the current state of the plan form back out as
// { upfrontAmount, upfrontDate, installments: [{amount, dueDate}] }.
function collectInstallmentPlan(root) {
  const upfrontAmount = Number(root.querySelector('[name=planUpfrontAmount]').value) || 0;
  const upfrontDate = root.querySelector('[name=planUpfrontDate]').value;
  const upfrontPaidThrough = root.querySelector('[name=paidThrough]') ? root.querySelector('[name=paidThrough]').value : '';
  const upfrontReferenceNumber = root.querySelector('[name=referenceNumber]') ? root.querySelector('[name=referenceNumber]').value : '';
  const upfrontBankName = root.querySelector('[name=bankName]') ? root.querySelector('[name=bankName]').value : '';
  const upfrontPaidBy = root.querySelector('[name=paidBy]') ? root.querySelector('[name=paidBy]').value : '';
  const installments = Array.from(root.querySelectorAll('[data-installment-row]'))
    .map((rowEl) => ({
      amount: Number(rowEl.querySelector('.inst-amount').value) || 0,
      dueDate: rowEl.querySelector('.inst-duedate').value,
    }))
    .filter((row) => row.amount > 0);
  return { upfrontAmount, upfrontDate, upfrontPaidThrough, upfrontReferenceNumber, upfrontBankName, upfrontPaidBy, installments };
}
