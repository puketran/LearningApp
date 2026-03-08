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

  const browseBtn = document.getElementById('btn-browse-files');
  if (browseBtn) browseBtn.addEventListener('click', loadFilesBrowser);
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

async function loadFilesBrowser() {
  const container = document.getElementById('storage-console-lines');
  if (!container) return;
  container.innerHTML = '<span style="opacity:.5">Browsing files on server…</span>';

  try {
    const res = await fetch(`${API_BASE}/api/files`);
    const d = await res.json();
    container.innerHTML = '';

    // Header row — data_dir path
    const header = document.createElement('div');
    header.className = 'console-line';
    header.innerHTML = `<span class="console-icon">📂</span><span class="console-label" style="font-weight:700">Data folder</span><span class="console-value ${d.exists ? 'console-ok' : 'console-error'}">${d.data_dir}</span>`;
    container.appendChild(header);

    if (!d.exists) {
      const err = document.createElement('div');
      err.className = 'console-line console-error';
      err.textContent = '❌ Folder does not exist on server';
      container.appendChild(err);
      return;
    }

    // users.json row
    const uline = document.createElement('div');
    uline.className = 'console-line ' + (d.users_json?.exists ? 'console-ok' : 'console-warn');
    uline.innerHTML = `<span class="console-icon">👤</span><span class="console-label">users.json</span><span class="console-value">${d.users_json?.exists ? d.users_json.size_kb + ' KB' : 'not found'}</span>`;
    container.appendChild(uline);

    const folderIcons = { books: '📚', images: '🖼️', audios: '🔊', recordings: '🎤' };
    for (const [fname, info] of Object.entries(d.folders || {})) {
      // Folder header row
      const frow = document.createElement('div');
      frow.className = 'console-line';
      frow.style.marginTop = '6px';
      frow.innerHTML = `<span class="console-icon">${folderIcons[fname] || '📁'}</span><span class="console-label" style="font-weight:600">${fname}/ (${info.files.length} files)</span><span class="console-value" style="font-size:.78rem;opacity:.6">${info.path}</span>`;
      container.appendChild(frow);

      if (info.files.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'console-line';
        empty.style.paddingLeft = '2rem';
        empty.innerHTML = '<span style="opacity:.4;font-size:.82rem;">(empty)</span>';
        container.appendChild(empty);
      } else {
        info.files.forEach(f => {
          const fline = document.createElement('div');
          fline.className = 'console-line';
          fline.style.paddingLeft = '2rem';
          fline.innerHTML = `<span class="console-icon" style="font-size:.7rem">└</span><span class="console-label" style="font-size:.8rem;font-family:monospace">${f.name}</span><span class="console-value" style="font-size:.8rem">${f.size_kb} KB</span>`;
          container.appendChild(fline);
        });
      }
    }
  } catch (err) {
    const container = document.getElementById('storage-console-lines');
    if (container) container.innerHTML = `<span class="console-error">❌ Error: ${err.message}</span>`;
  }
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
