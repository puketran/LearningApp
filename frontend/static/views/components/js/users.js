// ===== USER MANAGEMENT =====
// Handles user selection screen, PIN verification, and user creation.
// Current user is a module-level variable — resets on every page load
// so the user picker always appears after authentication.

let _currentUserId = null;
let _currentUserName = '';

function getCurrentUserId() {
  return _currentUserId;
}
function getCurrentUserName() {
  return _currentUserName;
}

// ── Show / hide screens ────────────────────────────────────────────────────────

function showUserSelectScreen() {
  const userScreen = document.getElementById('user-select-screen');
  const bookScreen = document.getElementById('book-list-screen');
  if (userScreen) userScreen.style.display = 'flex';
  if (bookScreen) bookScreen.style.display = 'none';
  loadUserList();
}

function hideUserSelectScreen() {
  const userScreen = document.getElementById('user-select-screen');
  if (userScreen) userScreen.style.display = 'none';
}

// ── Load and render user list ─────────────────────────────────────────────────

async function loadUserList() {
  const grid = document.getElementById('user-grid');
  if (!grid) return;
  grid.innerHTML = '<p style="color:#94a3b8;">Loading…</p>';
  try {
    const resp = await fetch(`${API_BASE}/api/users`);
    const data = await resp.json();
    const users = data.users || [];
    renderUserGrid(users);
  } catch (err) {
    grid.innerHTML = '<p style="color:#ef4444;">Failed to load users.</p>';
  }
}

function _initials(name) {
  return (name || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function renderUserGrid(users) {
  const grid = document.getElementById('user-grid');
  if (!grid) return;
  grid.innerHTML = '';

  users.forEach(u => {
    const card = document.createElement('div');
    card.className = 'user-card';
    card.dataset.userId = u.id;
    card.dataset.userName = u.name;
    card.innerHTML = `
      <div class="user-avatar">${escapeHtml(_initials(u.name))}</div>
      <div class="user-card-name">${escapeHtml(u.name)}</div>
      <button class="user-card-del" title="Delete user" data-user-id="${escapeHtml(u.id)}">
        <i class="fas fa-times"></i>
      </button>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.user-card-del')) return;
      openPinModal(u.id, u.name);
    });
    card.querySelector('.user-card-del').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteUser(u.id, u.name);
    });
    grid.appendChild(card);
  });

  // "Add user" card
  const addCard = document.createElement('div');
  addCard.className = 'user-card user-card-add';
  addCard.innerHTML = `
    <div class="user-avatar avatar-add"><i class="fas fa-plus"></i></div>
    <div class="user-card-name">Add user</div>
  `;
  addCard.addEventListener('click', openCreateUserModal);
  grid.appendChild(addCard);
}

// ── Delete user ───────────────────────────────────────────────────────────────

async function deleteUser(userId, userName) {
  if (!confirm(`Delete user "${userName}"? Their books will remain but will be visible to all users.`)) return;
  try {
    const resp = await fetch(`${API_BASE}/api/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    const data = await resp.json();
    if (data.error) { alert('Error: ' + data.error); return; }
    loadUserList();
  } catch (err) {
    alert('Failed to delete user: ' + err.message);
  }
}

// ── PIN modal ─────────────────────────────────────────────────────────────────

let _pinTarget = null;   // { id, name }
let _pinBuffer = '';

function openPinModal(userId, userName) {
  _pinTarget = { id: userId, name: userName };
  _pinBuffer = '';
  _renderPinDots();
  const nameEl = document.getElementById('pin-user-name');
  if (nameEl) nameEl.textContent = userName;
  const avatarEl = document.getElementById('pin-avatar');
  if (avatarEl) avatarEl.textContent = _initials(userName);
  const errEl = document.getElementById('pin-error');
  if (errEl) errEl.textContent = '';
  showModal('modal-user-pin');
}

function _renderPinDots() {
  document.querySelectorAll('.pin-dot').forEach((dot, i) => {
    dot.classList.toggle('filled', i < _pinBuffer.length);
  });
}

function pinKeyPress(val) {
  if (val === 'del') {
    _pinBuffer = _pinBuffer.slice(0, -1);
    _renderPinDots();
    return;
  }
  if (_pinBuffer.length >= 4) return;
  _pinBuffer += val;
  _renderPinDots();
  if (_pinBuffer.length === 4) {
    _submitPin();
  }
}

async function _submitPin() {
  if (!_pinTarget) return;
  const errEl = document.getElementById('pin-error');
  if (errEl) errEl.textContent = '';
  try {
    const resp = await fetch(`${API_BASE}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: _pinTarget.id, pin: _pinBuffer })
    });
    const data = await resp.json();
    if (data.ok) {
      hideModal('modal-user-pin');
      _loginSuccess(data.id, data.name);
    } else {
      _pinBuffer = '';
      _shakeDots();
      if (errEl) errEl.textContent = data.error || 'Wrong PIN – try again';
    }
  } catch (err) {
    _pinBuffer = '';
    _shakeDots();
    if (errEl) errEl.textContent = 'Network error – try again';
  }
}

function _shakeDots() {
  document.querySelectorAll('.pin-dot').forEach(dot => {
    dot.classList.remove('shake', 'filled');
    // force reflow so animation restarts
    void dot.offsetWidth;
    dot.classList.add('shake');
    dot.addEventListener('animationend', () => dot.classList.remove('shake'), { once: true });
  });
}

// Flash a key button briefly (visual feedback for keyboard presses)
function _flashKey(val) {
  const btn = document.querySelector(`.pin-key[data-val="${val}"]`);
  if (!btn) return;
  btn.classList.add('pressed');
  setTimeout(() => btn.classList.remove('pressed'), 140);
}

// ── Create user modal ─────────────────────────────────────────────────────────

function openCreateUserModal() {
  const nameInput = document.getElementById('input-new-user-name');
  const pinInput = document.getElementById('input-new-user-pin');
  const errEl = document.getElementById('create-user-error');
  if (nameInput) nameInput.value = '';
  if (pinInput) pinInput.value = '';
  if (errEl) errEl.textContent = '';
  showModal('modal-create-user');
  if (nameInput) setTimeout(() => nameInput.focus(), 100);
}

async function confirmCreateUser() {
  const name = (document.getElementById('input-new-user-name').value || '').trim();
  const pin = (document.getElementById('input-new-user-pin').value || '').trim();
  const errEl = document.getElementById('create-user-error');

  if (!name) { if (errEl) errEl.textContent = 'Please enter a name.'; return; }
  if (!pin.match(/^\d{4}$/)) { if (errEl) errEl.textContent = 'PIN must be exactly 4 digits.'; return; }

  try {
    const resp = await fetch(`${API_BASE}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pin })
    });
    const data = await resp.json();
    if (data.error) { if (errEl) errEl.textContent = data.error; return; }
    hideModal('modal-create-user');
    // Auto-login the newly created user
    _loginSuccess(data.id, data.name);
  } catch (err) {
    if (errEl) errEl.textContent = 'Failed: ' + err.message;
  }
}

// ── Login success ─────────────────────────────────────────────────────────────

function _loginSuccess(userId, userName) {
  _currentUserId = userId;
  _currentUserName = userName;
  hideUserSelectScreen();
  // Always go straight to the book list for this user
  showBookListScreen();
}

// ── Logout (back to user select) ──────────────────────────────────────────────

function logoutUser() {
  _currentUserId = null;
  _currentUserName = '';
  showUserSelectScreen();
}

// ── Init user screen events ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // PIN keypad buttons
  document.querySelectorAll('.pin-key').forEach(key => {
    key.addEventListener('click', () => pinKeyPress(key.dataset.val));
  });

  // Keyboard support for PIN modal
  document.addEventListener('keydown', (e) => {
    const pinModal = document.getElementById('modal-user-pin');
    if (!pinModal || pinModal.style.display === 'none') return;
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      _flashKey(e.key);
      pinKeyPress(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      _flashKey('del');
      pinKeyPress('del');
    } else if (e.key === 'Escape') {
      hideModal('modal-user-pin');
    }
  });

  // Create user confirm
  const confirmBtn = document.getElementById('btn-confirm-create-user');
  if (confirmBtn) confirmBtn.addEventListener('click', confirmCreateUser);

  // Enter key in create-user form
  ['input-new-user-name', 'input-new-user-pin'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmCreateUser(); });
  });

  // Enforce only digits in PIN field, max 4
  const pinInput = document.getElementById('input-new-user-pin');
  if (pinInput) {
    pinInput.addEventListener('input', () => {
      pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 4);
    });
  }

  // Switch user button
  const switchBtn = document.getElementById('btn-switch-user');
  if (switchBtn) switchBtn.addEventListener('click', logoutUser);
});
