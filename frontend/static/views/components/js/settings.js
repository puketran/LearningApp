// ===== APP SETTINGS (Data Folder) =====

async function openAppSettings() {
  try {
    const res = await fetch(`${API_BASE}/api/settings`);
    const data = await res.json();
    document.getElementById('settings-current-dir').textContent = data.data_dir || '(unknown)';
    document.getElementById('settings-new-dir').value = data.data_dir_config || data.data_dir || '';
  } catch {
    document.getElementById('settings-current-dir').textContent = '(could not load)';
  }
  const msgEl = document.getElementById('settings-message');
  msgEl.style.display = 'none';
  msgEl.className = 'settings-message';
  showModal('modal-app-settings');
}

async function saveAppSettings() {
  const newDir = document.getElementById('settings-new-dir').value.trim();
  const msgEl = document.getElementById('settings-message');

  if (!newDir) {
    msgEl.textContent = 'Please enter a folder path.';
    msgEl.className = 'settings-message settings-error';
    msgEl.style.display = 'block';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data_dir: newDir }),
    });
    const data = await res.json();

    if (!res.ok) {
      msgEl.textContent = data.error || 'Failed to save.';
      msgEl.className = 'settings-message settings-error';
      msgEl.style.display = 'block';
      return;
    }

    document.getElementById('settings-current-dir').textContent = data.data_dir;
    const barEl = document.getElementById('book-list-data-dir');
    if (barEl) barEl.textContent = data.data_dir;
    msgEl.textContent = data.message;
    msgEl.className = 'settings-message settings-success';
    msgEl.style.display = 'block';

    // Close and reload book list so new folder's books appear immediately
    setTimeout(() => {
      hideModal('modal-app-settings');
      if (typeof loadBookList === 'function') loadBookList();
    }, 1500);
  } catch (err) {
    msgEl.textContent = 'Network error: ' + err.message;
    msgEl.className = 'settings-message settings-error';
    msgEl.style.display = 'block';
  }
}

async function loadDataFolderDisplay() {
  try {
    const res = await fetch(`${API_BASE}/api/settings`);
    const data = await res.json();
    const el = document.getElementById('book-list-data-dir');
    if (el) el.textContent = data.data_dir || '(unknown)';
  } catch {
    const el = document.getElementById('book-list-data-dir');
    if (el) el.textContent = '(could not load)';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const openBtn = document.getElementById('btn-open-settings');
  if (openBtn) openBtn.addEventListener('click', openAppSettings);

  const saveBtn = document.getElementById('btn-save-settings');
  if (saveBtn) saveBtn.addEventListener('click', saveAppSettings);

  loadDataFolderDisplay();
});
