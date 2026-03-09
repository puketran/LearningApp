// ===== SECTION SELECTION =====
function selectSection(id, name) {
  currentSectionId = id;
  closeDetailPanel();
  document.getElementById('book-list-screen').style.display = 'none';
  document.getElementById('welcome-screen').style.display = 'none';
  document.getElementById('section-view').style.display = 'block';
  document.getElementById('section-title').textContent = name;
  document.getElementById('input-sentence-filter').value = '';
  document.getElementById('btn-clear-filter').style.display = 'none';
  switchSectionTab('vocabs'); // always default to vocabs tab
  renderTOC(); // update active state
}

function switchSectionTab(tab) {
  currentSectionTab = tab;

  // Update tab button active states
  document.querySelectorAll('.section-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  const isVocabs = tab === 'vocabs';
  document.getElementById('vocabs-tab-container').style.display = isVocabs ? 'block' : 'none';
  document.getElementById('sentences-tab-container').style.display = isVocabs ? 'none' : 'block';
  document.getElementById('sentence-filter-bar').style.display = isVocabs ? 'none' : 'flex';
  document.getElementById('btn-add-sentence').style.display = isVocabs ? 'none' : '';
  document.getElementById('btn-add-vocab').style.display = isVocabs ? '' : 'none';

  // Mobile hint: only show for sentences tab if not dismissed
  const mobileHint = document.getElementById('mobile-selection-hint');
  if (mobileHint) {
    const dismissed = localStorage.getItem('mobile-hint-dismissed') === 'true';
    mobileHint.style.display = (!isVocabs && !dismissed && window.innerWidth <= 768) ? '' : 'none';
  }

  // Update tab counts
  updateTabCounts();

  if (isVocabs) {
    renderVocabsTab();
  } else {
    renderSentences();
  }
}

function updateTabCounts() {
  const vocabs = appData.vocabs[currentSectionId] || [];
  const sentences = appData.sentences[currentSectionId] || [];
  const vc = document.getElementById('tab-count-vocabs');
  const sc = document.getElementById('tab-count-sentences');
  if (vc) vc.textContent = vocabs.length > 0 ? vocabs.length : '';
  if (sc) sc.textContent = sentences.length > 0 ? sentences.length : '';
  // Bin badge
  const binBadge = document.getElementById('bin-count-badge');
  if (binBadge) {
    const binCount = (appData.vocabBin || []).length;
    binBadge.textContent = binCount;
    binBadge.style.display = binCount > 0 ? '' : 'none';
  }
}

function renderVocabsTab() {
  const container = document.getElementById('vocabs-container');
  if (!container) return;
  const vocabs = appData.vocabs[currentSectionId] || [];

  if (vocabs.length === 0) {
    container.innerHTML = '<p class="empty-msg">No vocabularies yet. Select a word in any sentence to add vocabulary.</p>';
    return;
  }

  container.innerHTML = '';
  vocabs.forEach(vocab => {
    // Build display translation from definitions
    let displayTranslation = '';
    if (vocab.definitions && vocab.definitions.length > 0) {
      const parts = vocab.definitions
        .filter(d => d.vietnamese || d.english)
        .map(d => {
          const pos = d.pos ? `<span class="vc-pos">${escapeHtml(d.pos)}</span> ` : '';
          return pos + escapeHtml(d.vietnamese || d.english || '');
        });
      displayTranslation = parts.join(' &bull; ');
    } else if (vocab.translation || vocab.explanation) {
      displayTranslation = escapeHtml(vocab.translation || vocab.explanation || '');
    }

    const card = document.createElement('div');
    card.className = 'vocab-card';
    card.dataset.vocabId = vocab.id;

    const pronHtml = vocab.pronunciation
      ? `<span class="vc-pron">${escapeHtml(vocab.pronunciation)}</span>`
      : '';
    const audioHtml = vocab.audioFile
      ? `<button class="vc-audio-btn" title="Play pronunciation" data-audio="${escapeHtml(vocab.audioFile)}"><i class="fas fa-volume-up"></i></button>`
      : '';
    const mindmaps = getMindmaps ? getMindmaps() : {};
    const hasMindmap = mindmaps[vocab.id];
    const mmIcon = hasMindmap ? '<i class="fas fa-project-diagram vc-mm-icon" title="Has mindmap"></i>' : '';

    card.innerHTML = `
      <div class="vc-main">
        <div class="vc-word-row">
          <span class="vc-word">${escapeHtml(vocab.word)}</span>
          ${pronHtml}
          ${audioHtml}
          ${mmIcon}
        </div>
        ${displayTranslation ? `<div class="vc-translation">${displayTranslation}</div>` : ''}
        ${vocab.aiBrief ? `<div class="vc-brief">${escapeHtml(vocab.aiBrief)}</div>` : ''}
      </div>
      <div class="vc-actions">
        <button class="vc-mm-open-btn" title="Open mindmap"><i class="fas fa-project-diagram"></i></button>
        <button class="btn-del vc-del-btn" title="Delete"><i class="fas fa-trash"></i></button>
      </div>
    `;

    // Click card → open vocab panel (no sentence side panel)
    card.addEventListener('click', (e) => {
      if (e.target.closest('.vc-del-btn')) return;
      if (e.target.closest('.vc-audio-btn')) return;
      if (e.target.closest('.vc-mm-open-btn')) return;
      openVocabPanel(vocab.id, currentSectionId);
    });

    // Mindmap open button
    card.querySelector('.vc-mm-open-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openMindmapByVocabId(vocab.id, currentSectionId);
    });

    // Audio button
    const audioBtn = card.querySelector('.vc-audio-btn');
    if (audioBtn) {
      audioBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const file = audioBtn.dataset.audio;
        if (file) new Audio(`${API_BASE}/audios/${file}`).play();
      });
    }

    // Delete button
    card.querySelector('.vc-del-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm(`Move "${vocab.word}" to bin?`)) return;
      sendToVocabBin(vocab.id, currentSectionId);
      renderVocabsTab();
      renderSentences();
      updateTabCounts();
    });

    container.appendChild(card);
  });
}

function showWelcome() {
  document.getElementById('book-list-screen').style.display = 'none';
  document.getElementById('welcome-screen').style.display = 'flex';
  document.getElementById('section-view').style.display = 'none';
  document.getElementById('current-book-name').textContent = currentBookName;
}

