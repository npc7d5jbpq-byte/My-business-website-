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

function statusBadge(status) {
  const map = {
    available: 'badge-info',
    reserved: 'badge-warning',
    sold: 'badge-success',
    owned: 'badge-info',
    pending: 'badge-warning',
    completed: 'badge-success',
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
      <div class="topbar-user">
        <span>Signed in as <strong>${escapeHtml(session.username || '')}</strong></span>
        <button class="btn btn-ghost" id="logout-btn">Log out</button>
      </div>
    `;
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await apiRequest('/logout', { method: 'POST' });
      window.location.href = 'login.html';
    });
  }

  return session;
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
      closeModal();
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

function addMonthsToDate(dateStr, months) {
  const base = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(base.getTime())) return '';
  const d = new Date(base.getTime());
  d.setMonth(d.getMonth() + (Number(months) || 0));
  return d.toISOString().slice(0, 10);
}

function installmentPlanFormHtml({ includeDirection = false } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return `
    <p class="text-muted" style="margin:0 0 16px; font-size:12.5px; line-height:1.6;">
      Set the upfront/bayana amount, then add each remaining installment with its own amount -
      type how many months after the upfront it's due and the date fills in for you, or just pick
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

function installmentRowHtml() {
  return `
    <div class="installment-row" data-installment-row style="display:grid; grid-template-columns:1.2fr 1fr 1.2fr auto; gap:8px; margin-bottom:8px; align-items:end;">
      <label class="field" style="margin:0;"><span>Amount (Rs.)</span><input type="number" step="0.01" class="inst-amount" placeholder="e.g. 30" /></label>
      <label class="field" style="margin:0;"><span>After (months)</span><input type="number" min="0" step="1" class="inst-months" placeholder="e.g. 1" /></label>
      <label class="field" style="margin:0;"><span>Due date</span><input type="date" class="inst-duedate" /></label>
      <button type="button" class="btn btn-ghost btn-sm" data-remove-row title="Remove">&times;</button>
    </div>
  `;
}

// Wires up "+ Add Installment" / remove-row / months-after-auto-fill
// behaviour for a plan form already inserted into `root`. Starts with two
// rows pre-added, since a plan is rarely just one installment.
function initInstallmentPlanRows(root) {
  const rowsContainer = root.querySelector('[data-installment-rows]');
  const upfrontDateInput = root.querySelector('[name=planUpfrontDate]');

  function addRow() {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = installmentRowHtml();
    const rowEl = wrapper.firstElementChild;
    rowsContainer.appendChild(rowEl);
    const monthsInput = rowEl.querySelector('.inst-months');
    const dueDateInput = rowEl.querySelector('.inst-duedate');
    monthsInput.addEventListener('input', () => {
      if (monthsInput.value !== '') {
        dueDateInput.value = addMonthsToDate(upfrontDateInput.value, monthsInput.value);
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
  const installments = Array.from(root.querySelectorAll('[data-installment-row]'))
    .map((rowEl) => ({
      amount: Number(rowEl.querySelector('.inst-amount').value) || 0,
      dueDate: rowEl.querySelector('.inst-duedate').value,
    }))
    .filter((row) => row.amount > 0);
  return { upfrontAmount, upfrontDate, installments };
}
