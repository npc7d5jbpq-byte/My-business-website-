(async function () {
  const session = await initShell('backups.html');
  if (!session) return;
  setPageTitle('Backups & Restore');

  const LABELS = {
    startup: { text: 'Automatic — app started', cls: 'badge-info' },
    auto: { text: 'Automatic', cls: 'badge-info' },
    shutdown: { text: 'Automatic — app closed', cls: 'badge-info' },
    manual: { text: 'Manual', cls: 'badge-success' },
    'pre-restore': { text: 'Safety copy (before a restore)', cls: 'badge-warning' },
  };

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatDateTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  async function load() {
    try {
      const data = await apiRequest('/backups');
      document.getElementById('data-file-path').textContent = data.dataFile;
      document.getElementById('backups-dir-path').textContent = data.backupsDirectory;
      render(data.backups);
    } catch (err) {
      showBanner(err.message);
    }
  }

  function render(backups) {
    const body = document.getElementById('backups-body');
    if (!backups.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="4">No backups yet — one will be taken automatically shortly, or click "Backup Now".</td></tr>';
      return;
    }
    body.innerHTML = backups.map((b) => {
      const meta = LABELS[b.label] || { text: b.label, cls: 'badge-muted' };
      return `
        <tr>
          <td style="font-weight:600;">${formatDateTime(b.createdAt)}</td>
          <td><span class="badge ${meta.cls}">${escapeHtml(meta.text)}</span></td>
          <td class="text-right num">${formatSize(b.sizeBytes)}</td>
          <td>
            <div class="row-actions">
              <button class="btn btn-ghost btn-sm" data-restore="${escapeHtml(b.filename)}">Restore this backup</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  document.getElementById('backup-now-btn').addEventListener('click', async () => {
    try {
      await apiRequest('/backups', { method: 'POST' });
      showBanner('Backup created.', 'success');
      load();
    } catch (err) {
      showBanner(err.message);
    }
  });

  document.getElementById('backups-body').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-restore]');
    if (!btn) return;
    const filename = btn.dataset.restore;
    const row = btn.closest('tr');
    const when = row.querySelector('td').textContent;

    openCustomModal('Restore from Backup', `
      <p style="margin-top:0;">This will replace <strong>all current data</strong> with the backup from <strong>${escapeHtml(when)}</strong>.</p>
      <p>Your current data will automatically be saved as a safety copy first, so this can be undone by restoring again if needed.</p>
      <div class="modal-error" id="restore-error" hidden></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="restore-cancel">Cancel</button>
        <button type="button" class="btn btn-danger" id="restore-confirm">Restore This Backup</button>
      </div>
    `, (root) => {
      root.querySelector('#restore-cancel').addEventListener('click', closeModal);
      root.querySelector('#restore-confirm').addEventListener('click', async () => {
        const errBox = root.querySelector('#restore-error');
        const confirmBtn = root.querySelector('#restore-confirm');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Restoring…';
        try {
          await apiRequest(`/backups/${encodeURIComponent(filename)}/restore`, { method: 'POST' });
          closeModal();
          showBanner('Data restored successfully from backup.', 'success');
          load();
        } catch (err) {
          errBox.textContent = err.message;
          errBox.hidden = false;
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Restore This Backup';
        }
      });
    });
  });

  load();
})();
