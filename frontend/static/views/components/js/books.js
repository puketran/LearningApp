// ===== BOOK MANAGEMENT =====
async function loadBookList() {
  try {
    const uid = (typeof getCurrentUserId === 'function') ? (getCurrentUserId() || '') : '';
    const query = uid ? `?user_id=${encodeURIComponent(uid)}` : '';
    const resp = await fetch(`${API_BASE}/api/books${query}`);
    const data = await resp.json();
    return data.books || [];
  } catch (err) {
    console.error('Failed to load book list:', err);
    return [];
  }
}

async function saveBookToFile(name, silent = false) {
  const uid = (typeof getCurrentUserId === 'function') ? (getCurrentUserId() || undefined) : undefined;
  const payload = {
    name,
    filename: currentBookFile || undefined,
    user_id: uid,
    data: appData          // full appData: toc, sentences, vocabs, mindmaps,
                           // mindmapLayouts, vocabBin, config
  };
  try {
    const resp = await fetch(`${API_BASE}/api/books/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (data.error) { 
      if (!silent) alert('Save error: ' + data.error); 
      return false;
    }
    currentBookFile = data.filename;
    localStorage.setItem(BOOK_FILE_KEY, currentBookFile);
    if (!silent) {
      alert('Book saved! ✓ Accessible from all devices');
    }
    return true;
  } catch (err) {
    if (!silent) {
      alert('Failed to save: ' + err.message);
    }
    console.error('Save error:', err);
    return false;
  }
}

async function loadBookFromFile(filename) {
  try {
    const resp = await fetch(`${API_BASE}/api/books/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename })
    });
    if (!resp.ok) {
      const errText = await resp.text();
      let msg = `Server error ${resp.status}`;
      try { msg = JSON.parse(errText).error || msg; } catch (_) { }
      alert('Load error: ' + msg); return;
    }
    const result = await resp.json();
    if (result.error) { alert('Load error: ' + result.error); return; }
    
    // Merge every persisted field back into appData
    const bookData = result.data || result.book || {};
    appData.toc              = bookData.toc              || [];
    appData.sentences        = bookData.sentences        || {};
    appData.vocabs           = bookData.vocabs           || {};
    appData.mindmaps         = bookData.mindmaps         || {};
    appData.mindmapLayouts   = bookData.mindmapLayouts   || {};
    appData.vocabBin         = bookData.vocabBin         || [];
    appData.config           = bookData.config           || {
      fromLang:  'English',
      fromVoice: 'en-US-AvaMultilingualNeural',
      toLang:    'Vietnamese'
    };
    currentBookName = result.name || filename.replace('.json', '');
    currentBookFile = filename;
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    localStorage.setItem(BOOK_NAME_KEY, currentBookName);
    localStorage.setItem(BOOK_FILE_KEY, currentBookFile);
    currentSectionId = null;
    enterBookView();
  } catch (err) {
    alert('Failed to load: ' + err.message);
  }
}

async function deleteBookFile(filename) {
  if (!confirm('Delete this book permanently?')) return;
  try {
    const resp = await fetch(`${API_BASE}/api/books/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename })
    });
    if (!resp.ok) {
      const errText = await resp.text();
      let msg = `Server error ${resp.status}`;
      try { msg = JSON.parse(errText).error || msg; } catch (_) { }
      alert('Delete error: ' + msg); return;
    }
    renderBookListScreen();
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}

async function exportBook(filename, bookName) {
  try {
    const resp = await fetch(`${API_BASE}/api/books/export/${encodeURIComponent(filename)}`);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Export failed' }));
      alert('Export error: ' + (err.error || resp.statusText));
      return;
    }
    const blob = await resp.blob();
    const safeName = bookName.replace(/[^\w\s-]/g, '').trim() || 'book';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${safeName}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert('Export failed: ' + err.message);
  }
}

// ===== BOOK RENAME =====
let _renameTarget = null;   // { filename, currentName }

function openRenameBook(filename, currentName) {
  _renameTarget = { filename, currentName };
  const input = document.getElementById('input-rename-book');
  input.value = currentName;
  showModal('modal-rename-book');
  setTimeout(() => { input.focus(); input.select(); }, 100);
}

async function confirmRenameBook() {
  if (!_renameTarget) return;
  const newName = document.getElementById('input-rename-book').value.trim();
  if (!newName) return;
  hideModal('modal-rename-book');

  try {
    const resp = await fetch(`${API_BASE}/api/books/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: _renameTarget.filename, newName })
    });
    if (!resp.ok) {
      // Try to parse JSON error; fall back to HTTP status text
      const errText = await resp.text();
      let msg = `Server error ${resp.status}`;
      try { msg = JSON.parse(errText).error || msg; } catch (_) { }
      alert('Rename error: ' + msg);
      return;
    }
    const result = await resp.json();
    if (result.error) { alert('Rename error: ' + result.error); return; }

    // If we're renaming the currently open book, update state
    if (currentBookFile === _renameTarget.filename) {
      currentBookName = result.name;
      currentBookFile = result.filename;
      localStorage.setItem(BOOK_NAME_KEY, currentBookName);
      localStorage.setItem(BOOK_FILE_KEY, currentBookFile);
      document.getElementById('current-book-name').textContent = currentBookName;
      document.getElementById('sidebar-book-name-label').textContent = currentBookName;
    }
    _renameTarget = null;
    renderBookListScreen();
  } catch (err) {
    alert('Rename failed: ' + err.message);
  }
}

// ===== BOOK IMPORT =====
let _pendingImportFile = null;

function openImportModal() {
  const input = document.getElementById('input-import-zip');
  if (!input || !input.files || !input.files[0]) return;
  _pendingImportFile = input.files[0];
  input.value = '';   // reset so change event fires again next time

  // Pre-fill name from filename (strip .zip)
  const guessedName = _pendingImportFile.name.replace(/\.zip$/i, '');
  const nameInput = document.getElementById('input-import-book-name');
  nameInput.value = guessedName;
  showModal('modal-import-book');
  setTimeout(() => { nameInput.focus(); nameInput.select(); }, 100);
}

async function confirmImportBook() {
  if (!_pendingImportFile) return;
  const overrideName = document.getElementById('input-import-book-name').value.trim();
  hideModal('modal-import-book');

  const formData = new FormData();
  formData.append('file', _pendingImportFile);
  if (overrideName) formData.append('name', overrideName);
  const uid = (typeof getCurrentUserId === 'function') ? (getCurrentUserId() || '') : '';
  if (uid) formData.append('user_id', uid);
  _pendingImportFile = null;

  try {
    const resp = await fetch(`${API_BASE}/api/books/import`, {
      method: 'POST',
      body: formData
    });
    if (!resp.ok) {
      const errText = await resp.text();
      let msg = `Server error ${resp.status}`;
      try { msg = JSON.parse(errText).error || msg; } catch (_) { }
      alert('Import error: ' + msg); return;
    }
    const result = await resp.json();
    if (result.error) { alert('Import error: ' + result.error); return; }
    alert(`Book "${result.name}" imported successfully!`);
    renderBookListScreen();
  } catch (err) {
    alert('Import failed: ' + err.message);
  }
}

async function renderBookListScreen() {
  const listEl = document.getElementById('book-list');
  listEl.innerHTML = '<p style="color:#94a3b8;">Loading...</p>';
  const books = await loadBookList();

  if (books.length === 0) {
    listEl.innerHTML = '<p style="color:#94a3b8; font-style:italic;">No saved books yet.</p>';
  } else {
    listEl.innerHTML = '';
    books.forEach(book => {
      const item = document.createElement('div');
      item.className = 'book-list-item';
      item.innerHTML = `
        <span class="book-icon"><i class="fas fa-book"></i></span>
        <div class="book-info">
          <div class="book-name">${escapeHtml(book.name)}</div>
          <div class="book-meta">
            ${book.chapters} chapter(s)
            ${book.fromLang ? `<span class="book-lang-tag">${escapeHtml(book.fromLang)}${book.toLang ? ' → ' + escapeHtml(book.toLang) : ''}</span>` : ''}
          </div>
        </div>
        <div class="book-actions">
          <button class="btn-rename-book" title="Rename"><i class="fas fa-pen"></i></button>
          <button class="btn-export-book" title="Export as .zip"><i class="fas fa-file-export"></i></button>
          <button class="btn-delete-book" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      `;
      item.querySelector('.book-info').addEventListener('click', () => loadBookFromFile(book.filename));
      item.querySelector('.book-icon').addEventListener('click', () => loadBookFromFile(book.filename));
      item.querySelector('.btn-rename-book').addEventListener('click', (e) => {
        e.stopPropagation();
        openRenameBook(book.filename, book.name);
      });
      item.querySelector('.btn-export-book').addEventListener('click', (e) => {
        e.stopPropagation();
        exportBook(book.filename, book.name);
      });
      item.querySelector('.btn-delete-book').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteBookFile(book.filename);
      });
      listEl.appendChild(item);
    });
  }
}

function showBookListScreen() {
  document.getElementById('book-list-screen').style.display = 'flex';
  document.getElementById('welcome-screen').style.display = 'none';
  document.getElementById('section-view').style.display = 'none';
  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('detail-panel').classList.remove('open');

  // Show active user name in switch button
  const nameLabel = document.getElementById('book-list-user-name');
  if (nameLabel) {
    const uname = (typeof getCurrentUserName === 'function') ? getCurrentUserName() : '';
    nameLabel.textContent = uname ? uname : '';
  }

  renderBookListScreen();
}

function enterBookView() {
  document.getElementById('book-list-screen').style.display = 'none';
  document.getElementById('sidebar').style.display = 'flex';
  document.getElementById('current-book-name').textContent = currentBookName;
  document.getElementById('sidebar-book-name-label').textContent = currentBookName;
  renderTOC();
  showWelcome();
}

function createNewBook() {
  console.log('createNewBook called');
  const input = document.getElementById('input-book-name');
  const modal = document.getElementById('modal-new-book');
  console.log('Input element:', input);
  console.log('Modal element:', modal);
  
  if (!input || !modal) {
    console.error('Required elements not found!');
    return;
  }
  
  input.value = '';
  showModal('modal-new-book');
  setTimeout(() => input.focus(), 100);
}

function confirmCreateBook() {
  const name = document.getElementById('input-book-name').value.trim();
  if (!name) return;
  hideModal('modal-new-book');
  currentBookName = name;
  currentBookFile = '';
  appData = { toc: [], sentences: {}, vocabs: {}, vocabBin: [], config: { fromLang: 'English', fromVoice: 'en-US-AvaMultilingualNeural', toLang: 'Vietnamese' } };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  localStorage.setItem(BOOK_NAME_KEY, currentBookName);
  localStorage.setItem(BOOK_FILE_KEY, '');
  currentSectionId = null;
  
  // Save new book to server immediately (silent mode)
  saveBookToFile(currentBookName, true).then(() => {
    enterBookView();
  });
}

function saveCurrentBook() {
  if (!currentBookName) {
    // Open new book modal to get name first
    document.getElementById('input-book-name').value = '';
    showModal('modal-new-book');
    document.getElementById('btn-create-book-confirm')._saveMode = true;
    setTimeout(() => document.getElementById('input-book-name').focus(), 100);
    return;
  }
  localStorage.setItem(BOOK_NAME_KEY, currentBookName);
  saveBookToFile(currentBookName);
}

// ===== MODAL HELPERS =====
function showModal(id) {
  document.getElementById(id).style.display = 'flex';
}

function hideModal(id) {
  document.getElementById(id).style.display = 'none';
}

function showSentenceModal(title, text) {
  document.getElementById('modal-sentence-title').textContent = title;
  document.getElementById('input-sentence').value = text;
  showModal('modal-sentence');
  setTimeout(() => document.getElementById('input-sentence').focus(), 100);
}

function showTocModal(title, defaultValue, callback) {
  document.getElementById('modal-toc-title').textContent = title;
  document.getElementById('input-toc-name').value = defaultValue;
  showModal('modal-toc');
  setTimeout(() => {
    document.getElementById('input-toc-name').focus();
    document.getElementById('input-toc-name').select();
  }, 100);

  // Store callback
  document.getElementById('btn-save-toc')._callback = callback;
}

function showVocabModal(word) {
  document.getElementById('input-vocab-word').value = word;
  document.getElementById('input-vocab-translation').value = '';
  document.getElementById('input-vocab-explanation').value = '';
  showModal('modal-vocab');
  setTimeout(() => document.getElementById('input-vocab-translation').focus(), 100);
}

function showEditFieldModal(fieldName, currentValue) {
  editingFieldName = fieldName;
  const labels = {
    pronunciation: 'Edit Pronunciation',
    aiBrief: 'Edit AI Brief',
    notes: 'Edit Notes'
  };
  document.getElementById('modal-edit-field-title').textContent = labels[fieldName] || 'Edit';
  document.getElementById('input-edit-field').value = currentValue || '';
  showModal('modal-edit-field');
  setTimeout(() => document.getElementById('input-edit-field').focus(), 100);
}

// ===== TOC CONTEXT MENU =====
function showTocContextMenu(e, itemId) {
  tocContextTarget = itemId;
  const menu = document.getElementById('toc-context-menu');
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  menu.style.display = 'block';

  // Keep within viewport
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
  }
}

