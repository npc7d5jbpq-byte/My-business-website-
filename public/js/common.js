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
