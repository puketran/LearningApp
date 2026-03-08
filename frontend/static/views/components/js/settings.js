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
  // Only show the data-folder bar on localhost — hide it on public deployments
  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  const bar = document.querySelector('.data-folder-bar');
  const consoleEl = document.querySelector('.storage-console');
  if (!isLocalhost) {
    if (bar) bar.style.display = 'none';
    if (consoleEl) consoleEl.style.display = 'none';
    return;
  }
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

  const toggleBtn = document.getElementById('btn-toggle-console');
  if (toggleBtn) toggleBtn.addEventListener('click', toggleStorageConsole);

  const refreshBtn = document.getElementById('btn-refresh-console');
  if (refreshBtn) refreshBtn.addEventListener('click', loadStorageConsole);
});

// ===== STORAGE LOG CONSOLE =====

let _consoleOpen = false;

function toggleStorageConsole() {
  _consoleOpen = !_consoleOpen;
  const body = document.getElementById('storage-console-body');
  const chevron = document.getElementById('console-chevron');
  if (body) body.style.display = _consoleOpen ? 'block' : 'none';
  if (chevron) chevron.style.transform = _consoleOpen ? 'rotate(180deg)' : '';
  if (_consoleOpen) loadStorageConsole();
}

function _line(icon, label, value, cls) {
  const d = document.createElement('div');
  d.className = 'console-line' + (cls ? ' ' + cls : '');
  d.innerHTML = `<span class="console-icon">${icon}</span><span class="console-label">${label}</span><span class="console-value">${value}</span>`;
  return d;
}

async function loadStorageConsole() {
  const container = document.getElementById('storage-console-lines');
  if (!container) return;
  container.innerHTML = '<span style="opacity:.5">Fetching status…</span>';

  try {
    const res = await fetch(`${API_BASE}/api/status`);
    const d = await res.json();
    container.innerHTML = '';

    const uptimeMin = Math.floor((d.uptime_seconds || 0) / 60);
    const uptimeSec = (d.uptime_seconds || 0) % 60;

    container.appendChild(_line('🖥️', 'Platform', d.platform || '?'));
    container.appendChild(_line('⏱️', 'Server uptime', `${uptimeMin}m ${uptimeSec}s`));
    container.appendChild(_line('📂', 'Data folder', d.data_dir || '?',
      d.data_dir_exists === false ? 'console-warn' : 'console-ok'));

    if (d.disk_free_mb !== null && d.disk_free_mb !== undefined) {
      const cls = d.disk_free_mb < 50 ? 'console-warn' : 'console-ok';
      container.appendChild(_line('💾', 'Disk free', `${d.disk_free_mb} MB`, cls));
    }

    const dirIcons = { books: '📚', images: '🖼️', audios: '🔊', recordings: '🎤' };
    for (const [name, info] of Object.entries(d.dirs || {})) {
      const icon = dirIcons[name] || '📁';
      if (!info.exists) {
        container.appendChild(_line(icon, name + '/', 'folder missing', 'console-error'));
      } else {
        container.appendChild(_line(icon, name + '/',
          `${info.count} file${info.count !== 1 ? 's' : ''}, ${info.size_kb} KB`, 'console-ok'));
      }
    }

    // Update badge
    const badge = document.getElementById('storage-console-badge');
    if (badge) {
      const allOk = d.data_dir_exists !== false &&
        Object.values(d.dirs || {}).every(i => i.exists);
      badge.textContent = allOk ? '✅ OK' : '⚠️ Check';
      badge.className = 'console-badge ' + (allOk ? 'badge-ok' : 'badge-warn');
    }
  } catch (err) {
    container.innerHTML = `<span class="console-error">❌ Network error: ${err.message}</span>`;
  }
}
