/**
 * English Reading & Learning App
 * Data synced with server for cross-device access
 */

// ===== DATA MODEL =====
const STORAGE_KEY = 'english-reading-app';
const BOOK_NAME_KEY = 'english-reading-book-name';
const BOOK_FILE_KEY = 'english-reading-book-file';
const API_BASE = window.location.origin;

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const data = JSON.parse(raw);
    if (!data.vocabBin) data.vocabBin = [];
    if (!data.config) data.config = { fromLang: 'English', fromVoice: 'en-US-AvaMultilingualNeural', toLang: 'Vietnamese' };
    return data;
  }
  return { toc: [], sentences: {}, vocabs: {}, vocabBin: [], config: { fromLang: 'English', fromVoice: 'en-US-AvaMultilingualNeural', toLang: 'Vietnamese' } };
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  // Auto-sync to server if we have a current book
  if (currentBookFile) {
    autoSaveToServer();
  }
}

// Auto-save to server with debounce
let autoSaveTimer = null;
async function autoSaveToServer() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    if (!currentBookName || !currentBookFile) return;
    
    const syncStatus = document.getElementById('sync-status');
    if (syncStatus) {
      syncStatus.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i><span>Syncing...</span>';
      syncStatus.className = 'sync-status syncing';
      syncStatus.style.display = 'flex';
    }
    
    try {
      const response = await fetch(`${API_BASE}/api/books/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: currentBookName,
          filename: currentBookFile,
          data: appData
        })
      });
      
      if (response.ok) {
        console.log('✓ Auto-saved to server');
        if (syncStatus) {
          syncStatus.innerHTML = '<i class="fas fa-check"></i><span>Synced</span>';
          syncStatus.className = 'sync-status synced';
          setTimeout(() => {
            syncStatus.style.display = 'none';
          }, 2000);
        }
      } else {
        throw new Error('Save failed');
      }
    } catch (err) {
      console.error('Auto-save failed:', err);
      if (syncStatus) {
        syncStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>Sync failed</span>';
        syncStatus.className = 'sync-status error';
        setTimeout(() => {
          syncStatus.style.display = 'none';
        }, 3000);
      }
    }
  }, 1000); // Debounce 1 second
}

let appData = loadData();
let currentBookName = localStorage.getItem(BOOK_NAME_KEY) || '';
let currentBookFile = localStorage.getItem(BOOK_FILE_KEY) || '';
let currentSectionId = null;
let currentSectionTab = 'vocabs'; // 'vocabs' | 'sentences'
let currentVocabId = null;
let currentVocabSectionId = null;
let currentSentenceDetailId = null;    // sentence shown in detail panel
let tocContextTarget = null;
let editingFieldName = null;
let editingSentenceId = null;
let selectedTextForVocab = '';
let selectedSentenceIdForVocab = null;
let editingDefinitionIndex = null;     // for editing definitions
let mediaRecorder = null;
let audioChunks = [];
let recordingAudioPlayer = new Audio();

// ===== UTILITY =====
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== TOC RENDERING =====
function renderTOC() {
  const tree = document.getElementById('toc-tree');
  tree.innerHTML = '';
  appData.toc.forEach(item => {
    tree.appendChild(createTocNode(item));
  });
}

function createTocNode(item) {
  const el = document.createElement('div');
  el.className = 'toc-item';
  el.dataset.id = item.id;

  const hasChildren = item.children && item.children.length > 0;
  const sentenceCount = (appData.sentences[item.id] || []).length;
  const vocabCount = (appData.vocabs[item.id] || []).length;

  const row = document.createElement('div');
  row.className = 'toc-item-row' + (currentSectionId === item.id ? ' active' : '');

  row.innerHTML = `
    <span class="toggle-icon ${hasChildren ? '' : 'invisible'}" style="${hasChildren ? '' : 'visibility:hidden'}">
      <i class="fas fa-chevron-right"></i>
    </span>
    <span class="item-icon"><i class="fas ${hasChildren ? 'fa-folder' : 'fa-file-alt'}"></i></span>
    <span class="item-name">${escapeHtml(item.name)}</span>
    ${sentenceCount > 0 ? `<span class="item-count">${sentenceCount}</span>` : ''}
  `;

  // Click to select section
  row.addEventListener('click', (e) => {
    if (e.target.closest('.toggle-icon')) {
      toggleTocExpand(el);
      return;
    }
    selectSection(item.id, item.name);
  });

  // Right-click context menu
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showTocContextMenu(e, item.id);
  });

  el.appendChild(row);

  if (hasChildren) {
    const childContainer = document.createElement('div');
    childContainer.className = 'toc-children' + (isTocExpanded(item.id) ? ' expanded' : '');
    item.children.forEach(child => {
      childContainer.appendChild(createTocNode(child));
    });
    el.appendChild(childContainer);
  }

  return el;
}

// Track expanded state
let expandedSections = new Set(JSON.parse(localStorage.getItem('expanded-sections') || '[]'));

function isTocExpanded(id) {
  return expandedSections.has(id);
}

function toggleTocExpand(el) {
  const id = el.dataset.id;
  const children = el.querySelector('.toc-children');
  const toggleIcon = el.querySelector('.toggle-icon');
  if (!children) return;

  if (expandedSections.has(id)) {
    expandedSections.delete(id);
    children.classList.remove('expanded');
    toggleIcon.classList.remove('expanded');
  } else {
    expandedSections.add(id);
    children.classList.add('expanded');
    toggleIcon.classList.add('expanded');
  }
  localStorage.setItem('expanded-sections', JSON.stringify([...expandedSections]));
}

// ===== TOC OPERATIONS =====
function findTocItem(id, items = appData.toc) {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children) {
      const found = findTocItem(id, item.children);
      if (found) return found;
    }
  }
  return null;
}

function findTocParent(id, items = appData.toc, parent = null) {
  for (const item of items) {
    if (item.id === id) return { parent, list: items };
    if (item.children) {
      const found = findTocParent(id, item.children, item);
      if (found) return found;
    }
  }
  return null;
}

function addChapter() {
  showTocModal('Add Chapter', '', (name) => {
    const newItem = { id: uid(), name, children: [] };
    appData.toc.push(newItem);
    saveData();
    renderTOC();
  });
}

function addSubSection(parentId) {
  showTocModal('Add Sub-section', '', (name) => {
    const parent = findTocItem(parentId);
    if (!parent) return;
    if (!parent.children) parent.children = [];
    parent.children.push({ id: uid(), name, children: [] });
    expandedSections.add(parentId);
    localStorage.setItem('expanded-sections', JSON.stringify([...expandedSections]));
    saveData();
    renderTOC();
  });
}

function renameSection(id) {
  const item = findTocItem(id);
  if (!item) return;
  showTocModal('Rename', item.name, (name) => {
    item.name = name;
    saveData();
    renderTOC();
    if (currentSectionId === id) {
      document.getElementById('section-title').textContent = name;
    }
  });
}

function deleteSection(id) {
  if (!confirm('Delete this section and all its contents?')) return;

  // Collect all descendant IDs
  const idsToDelete = [];
  function collectIds(item) {
    idsToDelete.push(item.id);
    if (item.children) item.children.forEach(collectIds);
  }
  const item = findTocItem(id);
  if (item) collectIds(item);

  // Remove data
  idsToDelete.forEach(did => {
    delete appData.sentences[did];
    delete appData.vocabs[did];
  });

  // Remove from tree
  const info = findTocParent(id);
  if (info) {
    const idx = info.list.findIndex(i => i.id === id);
    if (idx !== -1) info.list.splice(idx, 1);
  }

  saveData();
  renderTOC();

  if (idsToDelete.includes(currentSectionId)) {
    currentSectionId = null;
    showWelcome();
  }
}

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

// ===== SENTENCES =====
function renderSentences() {
  const container = document.getElementById('sentences-container');
  const sentences = appData.sentences[currentSectionId] || [];
  const vocabs = appData.vocabs[currentSectionId] || [];

  if (sentences.length === 0) {
    container.innerHTML = '<p class="empty-msg">No sentences yet. Click "Add Sentence" to start.</p>';
    return;
  }

  container.innerHTML = '';
  sentences.forEach(sentence => {
    const card = document.createElement('div');
    card.className = 'sentence-card';
    card.dataset.sentenceId = sentence.id;

    // Highlight vocabs in sentence text
    let html = highlightVocabs(sentence.text, vocabs, sentence.id);

    card.innerHTML = `
      <div class="sentence-text">${html}</div>
      <div class="sentence-actions">
        <button class="btn-edit" title="Edit"><i class="fas fa-pen"></i></button>
        <button class="btn-del" title="Delete"><i class="fas fa-trash"></i></button>
      </div>
    `;

    // Edit sentence
    card.querySelector('.btn-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      editingSentenceId = sentence.id;
      showSentenceModal('Edit Sentence', sentence.text);
    });

    // Delete sentence
    card.querySelector('.btn-del').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('Delete this sentence?')) return;
      const arr = appData.sentences[currentSectionId];
      const idx = arr.findIndex(s => s.id === sentence.id);
      if (idx !== -1) arr.splice(idx, 1);
      // Remove vocabs linked to this sentence
      if (appData.vocabs[currentSectionId]) {
        appData.vocabs[currentSectionId] = appData.vocabs[currentSectionId].filter(v => v.sentenceId !== sentence.id);
      }
      saveData();
      renderSentences();
      renderTOC();
      updateTabCounts();
    });

    container.appendChild(card);

    // Click sentence card → open sentence detail panel
    card.addEventListener('click', (e) => {
      // Don't open panel if user is selecting text or clicking a vocab highlight
      if (window.getSelection().toString().trim()) return;
      if (e.target.closest('.vocab-highlight')) return;
      if (e.target.closest('.sentence-actions')) return;
      openSentencePanel(sentence.id);
    });
  });

  // Attach vocab click handlers
  container.querySelectorAll('.vocab-highlight').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const vocabId = el.dataset.vocabId;
      openVocabPanel(vocabId, currentSectionId);
    });
  });
}

function highlightVocabs(text, vocabs, sentenceId) {
  // Get vocabs for this sentence
  const sentenceVocabs = vocabs.filter(v => v.sentenceId === sentenceId);
  if (sentenceVocabs.length === 0) return escapeHtml(text);

  // Sort by position (longest first to avoid partial matches)
  const sorted = [...sentenceVocabs].sort((a, b) => b.word.length - a.word.length);

  // Build highlight regions
  let result = text;
  const markers = [];

  sorted.forEach(vocab => {
    const regex = new RegExp(`(${escapeRegex(vocab.word)})`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      markers.push({
        start: match.index,
        end: match.index + match[0].length,
        word: match[0],
        vocabId: vocab.id
      });
    }
  });

  // Remove overlapping markers (keep longer)
  const filtered = [];
  markers.sort((a, b) => a.start - b.start || b.end - a.end);
  let lastEnd = -1;
  for (const m of markers) {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  }

  // Build HTML
  let html = '';
  let pos = 0;
  for (const m of filtered) {
    html += escapeHtml(text.slice(pos, m.start));
    html += `<span class="vocab-highlight" data-vocab-id="${m.vocabId}">${escapeHtml(m.word)}</span>`;
    pos = m.end;
  }
  html += escapeHtml(text.slice(pos));

  return html;
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addSentence() {
  editingSentenceId = null;
  showSentenceModal('Add Sentence', '');
}

function saveSentence(text) {
  if (!text.trim()) return;
  if (!appData.sentences[currentSectionId]) {
    appData.sentences[currentSectionId] = [];
  }

  if (editingSentenceId) {
    // Update existing
    const sentence = appData.sentences[currentSectionId].find(s => s.id === editingSentenceId);
    if (sentence) sentence.text = text.trim();
  } else {
    // Add new
    appData.sentences[currentSectionId].push({ id: uid(), text: text.trim() });
  }

  editingSentenceId = null;
  saveData();
  renderSentences();
  renderTOC();
  updateTabCounts();
}

// ===== VOCAB MANAGEMENT =====
function addVocab(word, translation, explanation, sentenceId) {
  if (!appData.vocabs[currentSectionId]) {
    appData.vocabs[currentSectionId] = [];
  }

  // Check if vocab already exists for this word in this section
  const existing = appData.vocabs[currentSectionId].find(
    v => v.word.toLowerCase() === word.toLowerCase() && v.sentenceId === sentenceId
  );
  if (existing) {
    // Add as a new definition if there's content
    if (translation || explanation) {
      if (!existing.definitions) existing.definitions = [];
      existing.definitions.push({
        pos: '',
        vietnamese: translation || '',
        english: explanation || '',
        example: ''
      });
    }
  } else {
    const definitions = [];
    if (translation || explanation) {
      definitions.push({
        pos: '',
        vietnamese: translation || '',
        english: explanation || '',
        example: ''
      });
    }
    appData.vocabs[currentSectionId].push({
      id: uid(),
      word: word.trim(),
      pronunciation: '',
      definitions,
      aiBrief: '',
      notes: '',
      sentenceId
    });
  }

  saveData();
  renderSentences();
  updateTabCounts();
}

function openVocabPanel(vocabId, sectionId) {
  const vocabs = appData.vocabs[sectionId] || [];
  const vocab = vocabs.find(v => v.id === vocabId);
  if (!vocab) return;

  currentVocabId = vocabId;
  currentVocabSectionId = sectionId;

  // Migrate old data model: convert translation/explanation to definitions array
  if (!vocab.definitions) {
    vocab.definitions = [];
    if (vocab.translation || vocab.explanation) {
      vocab.definitions.push({
        pos: '',
        vietnamese: vocab.translation || '',
        english: vocab.explanation || '',
        example: ''
      });
    }
    delete vocab.translation;
    delete vocab.explanation;
    saveData();
  }

  // Hide sentence detail, show vocab detail
  document.getElementById('sentence-detail').style.display = 'none';
  document.getElementById('vocab-detail').style.display = 'flex';
  document.getElementById('detail-panel').classList.add('open');

  document.getElementById('vocab-panel-word-text').textContent = vocab.word;
  document.getElementById('vocab-pronunciation').textContent = vocab.pronunciation || '';
  document.getElementById('vocab-ai-brief').textContent = vocab.aiBrief || '';
  document.getElementById('vocab-notes').textContent = vocab.notes || '';

  renderDefinitionsList(vocab);

  // Check if audio exists for this word
  checkAudioExists(vocab.word);

  // Render all mindmaps list in vocab panel
  renderVocabPanelMindmapsList();

  // Clear sentence highlights
  currentSentenceDetailId = null;
  document.querySelectorAll('.sentence-card.active-sentence').forEach(el => el.classList.remove('active-sentence'));

  // Highlight active vocab card in vocabs tab
  document.querySelectorAll('.vocab-card.active-vocab').forEach(el => el.classList.remove('active-vocab'));
  const activeCard = document.querySelector(`.vocab-card[data-vocab-id="${vocabId}"]`);
  if (activeCard) activeCard.classList.add('active-vocab');
}

function renderDefinitionsList(vocab) {
  const container = document.getElementById('vocab-definitions-list');
  if (!vocab.definitions || vocab.definitions.length === 0) {
    container.innerHTML = '<p class="definitions-empty">No definitions yet. Click + to add.</p>';
    return;
  }

  container.innerHTML = '';
  vocab.definitions.forEach((def, index) => {
    const card = document.createElement('div');
    card.className = 'definition-card';
    card.innerHTML = `
      ${def.pos ? `<div class="def-pos">${escapeHtml(def.pos)}</div>` : ''}
      <div class="def-vietnamese">${escapeHtml(def.vietnamese || '')}</div>
      <div class="def-english">${escapeHtml(def.english || '')}</div>
      ${def.example ? `<div class="def-example">${escapeHtml(def.example)}</div>` : ''}
      <div class="def-actions">
        <button class="btn-edit-def" title="Edit" data-index="${index}"><i class="fas fa-pen"></i></button>
        <button class="btn-del-def" title="Delete" data-index="${index}"><i class="fas fa-trash"></i></button>
      </div>
    `;

    card.querySelector('.btn-edit-def').addEventListener('click', () => {
      editDefinition(index);
    });
    card.querySelector('.btn-del-def').addEventListener('click', () => {
      if (!confirm('Delete this definition?')) return;
      vocab.definitions.splice(index, 1);
      saveData();
      renderDefinitionsList(vocab);
    });

    container.appendChild(card);
  });
}

function closeDetailPanel() {
  document.getElementById('detail-panel').classList.remove('open');
  document.getElementById('sentence-detail').style.display = 'none';
  document.getElementById('vocab-detail').style.display = 'none';
  currentVocabId = null;
  currentVocabSectionId = null;
  currentSentenceDetailId = null;
  document.querySelectorAll('.sentence-card.active-sentence').forEach(el => el.classList.remove('active-sentence'));
}

function closeVocabPanel() {
  closeDetailPanel();
}

// ===== BOOK LANGUAGE CONFIG =====
function getBookConfig() {
  const defaults = { fromLang: 'English', fromVoice: 'en-US-AvaMultilingualNeural', toLang: 'Vietnamese' };
  return Object.assign({}, defaults, appData.config || {});
}

function openBookConfig() {
  const cfg = getBookConfig();
  document.getElementById('cfg-from-lang').value = cfg.fromLang;
  document.getElementById('cfg-to-lang').value = cfg.toLang;
  const preset = document.getElementById('cfg-voice-preset');
  const customRow = document.getElementById('cfg-voice-custom-row');
  const customInput = document.getElementById('cfg-from-voice');
  // Try to match a preset option
  const matchOption = Array.from(preset.options).find(o => o.value === cfg.fromVoice && o.value !== '__custom__');
  if (matchOption) {
    preset.value = cfg.fromVoice;
    customRow.style.display = 'none';
  } else {
    preset.value = '__custom__';
    customInput.value = cfg.fromVoice;
    customRow.style.display = '';
  }
  showModal('modal-book-config');
  setTimeout(() => document.getElementById('cfg-from-lang').focus(), 100);
}

function saveBookConfig() {
  const fromLang = document.getElementById('cfg-from-lang').value.trim() || 'English';
  const toLang = document.getElementById('cfg-to-lang').value.trim() || 'Vietnamese';
  const preset = document.getElementById('cfg-voice-preset').value;
  const fromVoice = preset === '__custom__'
    ? (document.getElementById('cfg-from-voice').value.trim() || 'en-US-AvaMultilingualNeural')
    : preset;
  if (!appData.config) appData.config = {};
  appData.config.fromLang = fromLang;
  appData.config.fromVoice = fromVoice;
  appData.config.toLang = toLang;
  saveData();
  hideModal('modal-book-config');
}

// ===== AUDIO TTS =====
let currentAudioFilename = null;
let audioPlayer = new Audio();

async function checkAudioExists(word) {
  const playBtn = document.getElementById('btn-play-audio');
  const genBtn = document.getElementById('btn-generate-audio');
  currentAudioFilename = null;
  playBtn.style.display = 'none';
  genBtn.style.display = '';

  try {
    const res = await fetch('/api/tts/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word })
    });
    const data = await res.json();
    if (data.exists) {
      currentAudioFilename = data.filename;
      playBtn.style.display = '';
      genBtn.style.display = 'none';
    }
  } catch (e) {
    console.error('Check audio error:', e);
  }
}

async function generateAudio() {
  if (!currentVocabId || !currentVocabSectionId) return;
  const vocabs = appData.vocabs[currentVocabSectionId] || [];
  const vocab = vocabs.find(v => v.id === currentVocabId);
  if (!vocab) return;

  const genBtn = document.getElementById('btn-generate-audio');
  const playBtn = document.getElementById('btn-play-audio');
  genBtn.disabled = true;
  genBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  try {
    const res = await fetch('/api/tts/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: vocab.word, voice: getBookConfig().fromVoice })
    });
    const data = await res.json();
    if (data.success) {
      currentAudioFilename = data.filename;
      playBtn.style.display = '';
      genBtn.style.display = 'none';
      // Auto-play after generating
      playAudio();
    } else {
      alert('TTS error: ' + (data.error || 'Unknown error'));
    }
  } catch (e) {
    alert('TTS request failed: ' + e.message);
  } finally {
    genBtn.disabled = false;
    genBtn.innerHTML = '<i class="fas fa-microphone"></i>';
  }
}

function playAudio() {
  if (!currentAudioFilename) return;
  const playBtn = document.getElementById('btn-play-audio');
  audioPlayer.src = '/audios/' + currentAudioFilename + '?t=' + Date.now();
  audioPlayer.play().catch(e => console.error('Play error:', e));

  playBtn.classList.add('playing');
  audioPlayer.onended = () => playBtn.classList.remove('playing');
}

// ===== SENTENCE TTS =====
let currentSentenceAudioFilename = null;
let sentenceAudioPlayer = new Audio();

async function checkSentenceAudioExists(sentenceId) {
  const playBtn = document.getElementById('btn-play-sentence-audio');
  const genBtn = document.getElementById('btn-generate-sentence-audio');
  currentSentenceAudioFilename = null;
  playBtn.style.display = 'none';
  genBtn.style.display = '';

  try {
    const res = await fetch('/api/tts/check-sentence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentenceId })
    });
    const data = await res.json();
    if (data.exists) {
      currentSentenceAudioFilename = data.filename;
      playBtn.style.display = '';
      genBtn.style.display = 'none';
    }
  } catch (e) {
    console.error('Check sentence audio error:', e);
  }
}

async function generateSentenceAudio() {
  if (!currentSentenceDetailId || !currentSectionId) return;
  const sentences = appData.sentences[currentSectionId] || [];
  const sentence = sentences.find(s => s.id === currentSentenceDetailId);
  if (!sentence) return;

  const genBtn = document.getElementById('btn-generate-sentence-audio');
  const playBtn = document.getElementById('btn-play-sentence-audio');
  genBtn.disabled = true;
  genBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  try {
    const res = await fetch('/api/tts/generate-sentence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentenceId: sentence.id, text: sentence.text, voice: getBookConfig().fromVoice })
    });
    const data = await res.json();
    if (data.success) {
      currentSentenceAudioFilename = data.filename;
      playBtn.style.display = '';
      genBtn.style.display = 'none';
      // Auto-play after generating
      playSentenceAudio();
    } else {
      alert('TTS error: ' + (data.error || 'Unknown error'));
    }
  } catch (e) {
    alert('TTS request failed: ' + e.message);
  } finally {
    genBtn.disabled = false;
    genBtn.innerHTML = '<i class="fas fa-microphone"></i> Generate';
  }
}

function playSentenceAudio() {
  if (!currentSentenceAudioFilename) return;
  const playBtn = document.getElementById('btn-play-sentence-audio');
  sentenceAudioPlayer.src = '/audios/' + currentSentenceAudioFilename + '?t=' + Date.now();
  sentenceAudioPlayer.play().catch(e => console.error('Play error:', e));

  playBtn.classList.add('playing');
  playBtn.innerHTML = '<i class="fas fa-pause"></i> Playing';
  sentenceAudioPlayer.onended = () => {
    playBtn.classList.remove('playing');
    playBtn.innerHTML = '<i class="fas fa-volume-up"></i> Play';
  };
}

// ===== VOICE RECORDING =====
let currentRecordingFilename = null;

async function checkRecordingExists(sentenceId) {
  const recordBtn = document.getElementById('btn-record-voice');
  const playBtn = document.getElementById('btn-play-recording');
  const deleteBtn = document.getElementById('btn-delete-recording');
  currentRecordingFilename = null;
  
  playBtn.style.display = 'none';
  deleteBtn.style.display = 'none';
  recordBtn.style.display = '';

  try {
    const res = await fetch(`${API_BASE}/api/recordings/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentenceId })
    });
    const data = await res.json();
    if (data.exists) {
      currentRecordingFilename = data.filename;
      playBtn.style.display = '';
      deleteBtn.style.display = '';
    }
  } catch (e) {
    console.error('Check recording error:', e);
  }
}

async function startRecording() {
  if (!currentSentenceDetailId) return;
  
  let stream;
  
  try {
    // Polyfill for older browsers (especially iOS Safari)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      // Try older API
      const getUserMedia = navigator.getUserMedia || 
                          navigator.webkitGetUserMedia || 
                          navigator.mozGetUserMedia || 
                          navigator.msGetUserMedia;
      
      if (!getUserMedia) {
        alert('Your browser does not support audio recording. Please use a modern browser like Chrome, Firefox, or Safari 11+.');
        return;
      }
      
      // Wrap old API in a Promise
      stream = await new Promise((resolve, reject) => {
        getUserMedia.call(navigator, { audio: true }, resolve, reject);
      });
    } else {
      // Modern API
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      await uploadRecording(audioBlob, currentSentenceDetailId);
      
      // Stop all tracks
      stream.getTracks().forEach(track => track.stop());
    };
    
    mediaRecorder.start();
    
    // Update UI
    document.getElementById('btn-record-voice').style.display = 'none';
    document.getElementById('btn-stop-recording').style.display = '';
    document.getElementById('btn-play-recording').style.display = 'none';
    document.getElementById('btn-delete-recording').style.display = 'none';
  } catch (err) {
    alert('Error accessing microphone: ' + err.message);
    console.error('Recording error:', err);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    document.getElementById('btn-stop-recording').style.display = 'none';
  }
}

async function uploadRecording(audioBlob, sentenceId) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');
  formData.append('sentenceId', sentenceId);
  
  try {
    const response = await fetch(`${API_BASE}/api/recordings/upload`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.success) {
      currentRecordingFilename = data.filename;
      document.getElementById('btn-record-voice').style.display = '';
      document.getElementById('btn-play-recording').style.display = '';
      document.getElementById('btn-delete-recording').style.display = '';
      console.log('✓ Recording uploaded');
    } else {
      alert('Upload failed: ' + (data.error || 'Unknown error'));
      document.getElementById('btn-record-voice').style.display = '';
    }
  } catch (err) {
    alert('Upload failed: ' + err.message);
    console.error('Upload error:', err);
    document.getElementById('btn-record-voice').style.display = '';
  }
}

function playRecording() {
  if (!currentRecordingFilename) return;
  const playBtn = document.getElementById('btn-play-recording');
  recordingAudioPlayer.src = '/recordings/' + currentRecordingFilename + '?t=' + Date.now();
  recordingAudioPlayer.play().catch(e => console.error('Play error:', e));
  
  playBtn.classList.add('playing');
  playBtn.innerHTML = '<i class="fas fa-pause"></i> Playing';
  
  recordingAudioPlayer.onended = () => {
    playBtn.classList.remove('playing');
    playBtn.innerHTML = '<i class="fas fa-play"></i> Play';
  };
}

async function deleteRecording() {
  if (!currentSentenceDetailId || !currentRecordingFilename) return;
  
  if (!confirm('Delete this voice recording?')) return;
  
  // Since we don't have a delete endpoint, we can just re-upload an empty recording
  // Or simply update the UI and let the user re-record
  currentRecordingFilename = null;
  document.getElementById('btn-play-recording').style.display = 'none';
  document.getElementById('btn-delete-recording').style.display = 'none';
  document.getElementById('btn-record-voice').style.display = '';
  
  alert('Recording deleted. You can record a new one.');
}

// ===== SENTENCE DETAIL PANEL =====
function openSentencePanel(sentenceId) {
  const sentences = appData.sentences[currentSectionId] || [];
  const sentence = sentences.find(s => s.id === sentenceId);
  if (!sentence) return;

  currentSentenceDetailId = sentenceId;

  // Hide vocab detail, show sentence detail
  document.getElementById('vocab-detail').style.display = 'none';
  document.getElementById('sentence-detail').style.display = 'flex';
  document.getElementById('detail-panel').classList.add('open');

  document.getElementById('sp-english').textContent = sentence.text;
  document.getElementById('sp-vietnamese').textContent = sentence.vietnamese || '';
  document.getElementById('sp-notes').textContent = sentence.spNotes || '';

  // Highlight active sentence card
  document.querySelectorAll('.sentence-card.active-sentence').forEach(el => el.classList.remove('active-sentence'));
  const card = document.querySelector(`.sentence-card[data-sentence-id="${sentenceId}"]`);
  if (card) card.classList.add('active-sentence');

  // Check for existing voice recording
  checkRecordingExists(sentenceId);
  
  // Check for existing AI voice over
  checkSentenceAudioExists(sentenceId);
  
  // Auto-translate if no Vietnamese translation yet
  if (!sentence.vietnamese) {
    aiTranslateSentence();
  }
}

async function aiTranslateSentence() {
  if (!currentSentenceDetailId || !currentSectionId) return;
  const sentences = appData.sentences[currentSectionId] || [];
  const sentenceId = currentSentenceDetailId;
  const sentence = sentences.find(s => s.id === sentenceId);
  if (!sentence) return;

  const btn = document.getElementById('btn-ai-translate-sentence');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Translating...';

  try {
    const resp = await fetch(`${API_BASE}/api/translate-sentence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentence: sentence.text, fromLang: getBookConfig().fromLang, toLang: getBookConfig().toLang })
    });
    const data = await resp.json();
    console.log('Translate sentence response:', data);

    if (data.result) {
      // Handle both possible response formats
      const vietnamese = data.result.translation || data.result.vietnamese_meaning || '';
      const notes = data.result.notes || '';
      sentence.vietnamese = vietnamese;
      sentence.spNotes = notes;
      saveData();
      // Only update UI if we're still viewing the same sentence
      if (currentSentenceDetailId === sentenceId) {
        document.getElementById('sp-vietnamese').textContent = sentence.vietnamese;
        document.getElementById('sp-notes').textContent = sentence.spNotes;
      }
    } else if (data.error) {
      console.error('AI translate error:', data.error);
    }
  } catch (err) {
    console.error('AI translate failed:', err);
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-robot"></i> AI Translate';
}

function editSentenceField(field) {
  if (!currentSentenceDetailId || !currentSectionId) return;
  const sentences = appData.sentences[currentSectionId] || [];
  const sentence = sentences.find(s => s.id === currentSentenceDetailId);
  if (!sentence) return;

  const dataField = field === 'vietnamese' ? 'vietnamese' : 'spNotes';
  const labels = { vietnamese: 'Edit Vietnamese Translation', notes: 'Edit Notes' };
  editingFieldName = '__sentence__' + dataField;
  document.getElementById('modal-edit-field-title').textContent = labels[field] || 'Edit';
  document.getElementById('input-edit-field').value = sentence[dataField] || '';
  showModal('modal-edit-field');
  setTimeout(() => document.getElementById('input-edit-field').focus(), 100);
}

// ===== DEFINITIONS =====
function showAddDefinitionModal() {
  editingDefinitionIndex = null;
  document.getElementById('modal-definition-title').textContent = 'Add Definition';
  document.getElementById('input-def-pos').value = '';
  document.getElementById('input-def-vietnamese').value = '';
  document.getElementById('input-def-english').value = '';
  document.getElementById('input-def-example').value = '';
  showModal('modal-definition');
  setTimeout(() => document.getElementById('input-def-pos').focus(), 100);
}

function editDefinition(index) {
  const vocabs = appData.vocabs[currentVocabSectionId] || [];
  const vocab = vocabs.find(v => v.id === currentVocabId);
  if (!vocab || !vocab.definitions || !vocab.definitions[index]) return;

  editingDefinitionIndex = index;
  const def = vocab.definitions[index];
  document.getElementById('modal-definition-title').textContent = 'Edit Definition';
  document.getElementById('input-def-pos').value = def.pos || '';
  document.getElementById('input-def-vietnamese').value = def.vietnamese || '';
  document.getElementById('input-def-english').value = def.english || '';
  document.getElementById('input-def-example').value = def.example || '';
  showModal('modal-definition');
  setTimeout(() => document.getElementById('input-def-pos').focus(), 100);
}

function saveDefinition() {
  if (!currentVocabId || !currentVocabSectionId) return;
  const vocabs = appData.vocabs[currentVocabSectionId] || [];
  const vocab = vocabs.find(v => v.id === currentVocabId);
  if (!vocab) return;

  if (!vocab.definitions) vocab.definitions = [];

  const def = {
    pos: document.getElementById('input-def-pos').value.trim(),
    vietnamese: document.getElementById('input-def-vietnamese').value.trim(),
    english: document.getElementById('input-def-english').value.trim(),
    example: document.getElementById('input-def-example').value.trim()
  };

  if (editingDefinitionIndex !== null && vocab.definitions[editingDefinitionIndex]) {
    vocab.definitions[editingDefinitionIndex] = def;
  } else {
    vocab.definitions.push(def);
  }

  editingDefinitionIndex = null;
  saveData();
  renderDefinitionsList(vocab);
  hideModal('modal-definition');
}

function updateVocabField(field, value) {
  if (!currentVocabId || !currentVocabSectionId) return;
  const vocabs = appData.vocabs[currentVocabSectionId] || [];
  const vocab = vocabs.find(v => v.id === currentVocabId);
  if (!vocab) return;
  vocab[field] = value;
  saveData();
  // Refresh panel display
  if (field === 'pronunciation') document.getElementById('vocab-pronunciation').textContent = value;
  else if (field === 'aiBrief') document.getElementById('vocab-ai-brief').textContent = value;
  else if (field === 'notes') document.getElementById('vocab-notes').textContent = value;
}

function deleteVocab() {
  if (!currentVocabId || !currentVocabSectionId) return;
  if (!confirm('Move this vocabulary to bin?')) return;
  sendToVocabBin(currentVocabId, currentVocabSectionId);
  closeDetailPanel();
  renderSentences();
  if (currentSectionTab === 'vocabs') renderVocabsTab();
  updateTabCounts();
}

function sendToVocabBin(vocabId, sectionId) {
  if (!appData.vocabBin) appData.vocabBin = [];
  const arr = appData.vocabs[sectionId] || [];
  const idx = arr.findIndex(v => v.id === vocabId);
  if (idx === -1) return;
  const vocab = arr.splice(idx, 1)[0];
  const mindmaps = getMindmaps();
  const mindmap = mindmaps[vocabId] ? JSON.parse(JSON.stringify(mindmaps[vocabId])) : null;
  if (mindmaps[vocabId]) delete mindmaps[vocabId];
  appData.vocabBin.push({ vocab, sectionId, mindmap, deletedAt: Date.now() });
  saveData();
}

function openVocabBin() {
  renderVocabBin();
  document.getElementById('vocab-bin-overlay').style.display = 'flex';
}

function closeVocabBin() {
  document.getElementById('vocab-bin-overlay').style.display = 'none';
}

function renderVocabBin() {
  const content = document.getElementById('vocab-bin-content');
  if (!content) return;
  const bin = appData.vocabBin || [];
  if (bin.length === 0) {
    content.innerHTML = '<p class="empty-msg">Bin is empty.</p>';
    return;
  }
  content.innerHTML = '';
  const sections = flattenAllSections ? flattenAllSections(appData.toc) : [];
  bin.slice().reverse().forEach((entry, rIdx) => {
    const idx = bin.length - 1 - rIdx; // real index in bin array
    const sectionName = (sections.find(s => s.id === entry.sectionId) || {}).name || entry.sectionId;
    const date = new Date(entry.deletedAt).toLocaleDateString();
    const item = document.createElement('div');
    item.className = 'vocab-bin-item';
    item.innerHTML = `
      <div class="vbi-info">
        <span class="vbi-word">${escapeHtml(entry.vocab.word)}</span>
        <span class="vbi-section">${escapeHtml(sectionName)}</span>
        <span class="vbi-date">${date}</span>
      </div>
      <div class="vbi-actions">
        <button class="btn btn-sm btn-outline vbi-restore"><i class="fas fa-undo"></i> Restore</button>
        <button class="btn btn-sm btn-danger vbi-delete"><i class="fas fa-trash"></i> Delete</button>
      </div>
    `;
    item.querySelector('.vbi-restore').addEventListener('click', () => {
      // Restore vocab and its mindmap
      if (!appData.vocabs[entry.sectionId]) appData.vocabs[entry.sectionId] = [];
      appData.vocabs[entry.sectionId].push(entry.vocab);
      if (entry.mindmap) getMindmaps()[entry.vocab.id] = entry.mindmap;
      appData.vocabBin.splice(idx, 1);
      saveData();
      updateTabCounts();
      if (currentSectionId === entry.sectionId && currentSectionTab === 'vocabs') renderVocabsTab();
      renderVocabBin();
    });
    item.querySelector('.vbi-delete').addEventListener('click', () => {
      if (!confirm(`Permanently delete "${entry.vocab.word}"?`)) return;
      appData.vocabBin.splice(idx, 1);
      saveData();
      updateTabCounts();
      renderVocabBin();
    });
    content.appendChild(item);
  });
}

function deleteAllFromBin() {
  if (!(appData.vocabBin || []).length) return;
  if (!confirm(`Permanently delete all ${appData.vocabBin.length} items in bin? This cannot be undone.`)) return;
  appData.vocabBin = [];
  saveData();
  updateTabCounts();
  renderVocabBin();
}

// ===== VOCAB LIST =====
function showVocabList() {
  const vocabs = appData.vocabs[currentSectionId] || [];
  const content = document.getElementById('vocab-list-content');

  if (vocabs.length === 0) {
    content.innerHTML = '<p class="vocab-list-empty">No vocabularies added yet. Select text in a sentence to add words.</p>';
  } else {
    content.innerHTML = '';
    vocabs.forEach(vocab => {
      // Get first definition's Vietnamese for display
      let displayTranslation = '—';
      if (vocab.definitions && vocab.definitions.length > 0) {
        displayTranslation = vocab.definitions[0].vietnamese || vocab.definitions[0].english || '—';
        if (vocab.definitions.length > 1) {
          displayTranslation += ` (+${vocab.definitions.length - 1} more)`;
        }
      } else if (vocab.translation || vocab.explanation) {
        // Legacy support
        displayTranslation = vocab.translation || vocab.explanation || '—';
      }

      const item = document.createElement('div');
      item.className = 'vocab-list-item';
      item.innerHTML = `
        <span class="vl-word">${escapeHtml(vocab.word)}</span>
        <span class="vl-translation">${escapeHtml(displayTranslation)}</span>
        <button class="vl-filter-btn" title="Filter by this word"><i class="fas fa-filter"></i></button>
      `;

      // Click word → open vocab panel
      item.querySelector('.vl-word').addEventListener('click', () => {
        document.getElementById('vocab-list-overlay').style.display = 'none';
        openVocabPanel(vocab.id, currentSectionId);
      });
      item.querySelector('.vl-translation').addEventListener('click', () => {
        document.getElementById('vocab-list-overlay').style.display = 'none';
        openVocabPanel(vocab.id, currentSectionId);
      });

      // Click filter button → add word to sentence filter
      item.querySelector('.vl-filter-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('vocab-list-overlay').style.display = 'none';
        const filterInput = document.getElementById('input-sentence-filter');
        filterInput.value = vocab.word;
        filterSentences();
      });

      content.appendChild(item);
    });
  }

  document.getElementById('vocab-list-overlay').style.display = 'flex';
}

// ===== TEXT SELECTION & CONTEXT MENU =====
// Get word at cursor position
function getWordAtPoint(x, y) {
  const range = document.caretRangeFromPoint ? 
    document.caretRangeFromPoint(x, y) : 
    document.caretPositionFromPoint ? 
    (() => {
      const pos = document.caretPositionFromPoint(x, y);
      if (!pos) return null;
      const range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      return range;
    })() : null;
  
  if (!range) return null;
  
  const textNode = range.startContainer;
  if (textNode.nodeType !== Node.TEXT_NODE) return null;
  
  const text = textNode.textContent;
  let start = range.startOffset;
  let end = range.startOffset;
  
  // Find word boundaries (letters, numbers, hyphens, apostrophes)
  const wordChars = /[a-zA-Z0-9'\-]/;
  
  // Expand backward
  while (start > 0 && wordChars.test(text[start - 1])) {
    start--;
  }
  
  // Expand forward
  while (end < text.length && wordChars.test(text[end])) {
    end++;
  }
  
  const word = text.substring(start, end).trim();
  
  if (word.length > 0) {
    return { word, textNode, start, end };
  }
  
  return null;
}

// Select word programmatically
function selectWord(textNode, start, end) {
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

// Mobile tap handler - tap on word to select it
function handleMobileTap(e) {
  // Only on mobile devices
  if (window.innerWidth > 768) return;
  
  const ctxMenu = document.getElementById('text-context-menu');
  const sentenceCard = e.target.closest('.sentence-card');
  
  if (!sentenceCard) {
    ctxMenu.style.display = 'none';
    return;
  }
  
  // Check if tap is on sentence text (not buttons)
  if (e.target.closest('.sentence-actions')) return;
  
  // Get tap coordinates
  const touch = e.changedTouches ? e.changedTouches[0] : e;
  const x = touch.clientX;
  const y = touch.clientY;
  
  // Check if tapping on existing vocab highlight
  if (e.target.classList.contains('vocab-highlight')) {
    // Tapped on vocab - show vocab detail panel
    e.target.click();
    return;
  }
  
  // Try to get word at tap position
  const wordInfo = getWordAtPoint(x, y);
  
  if (wordInfo && wordInfo.word.length > 0) {
    // Select the word
    selectWord(wordInfo.textNode, wordInfo.start, wordInfo.end);
    
    selectedTextForVocab = wordInfo.word;
    selectedSentenceIdForVocab = sentenceCard.dataset.sentenceId;
    
    // Show context menu
    ctxMenu.style.left = x + 'px';
    ctxMenu.style.top = (y - 60) + 'px'; // Position above the tap
    ctxMenu.style.display = 'block';
    
    // Keep within viewport
    const rect = ctxMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      ctxMenu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    }
    if (rect.top < 0) {
      ctxMenu.style.top = (y + 20) + 'px'; // Position below if no space above
    }
    
    e.preventDefault();
  } else {
    // Tapped on empty space - open sentence detail
    if (!e.target.closest('.sentence-actions')) {
      sentenceCard.click();
    }
  }
}

// Desktop text selection handler
function handleTextSelection(e) {
  // Only on desktop
  if (window.innerWidth <= 768) return;
  
  const ctxMenu = document.getElementById('text-context-menu');
  const sentenceCard = e.target.closest('.sentence-card');
  
  if (!sentenceCard) {
    ctxMenu.style.display = 'none';
    return;
  }

  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 0 && text.length < 200) {
      selectedTextForVocab = text;
      selectedSentenceIdForVocab = sentenceCard.dataset.sentenceId;

      ctxMenu.style.left = e.clientX + 'px';
      ctxMenu.style.top = e.clientY + 'px';
      ctxMenu.style.display = 'block';

      // Keep it within viewport
      const rect = ctxMenu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        ctxMenu.style.left = (window.innerWidth - rect.width - 8) + 'px';
      }
      if (rect.bottom > window.innerHeight) {
        ctxMenu.style.top = (window.innerHeight - rect.height - 8) + 'px';
      }
    } else {
      ctxMenu.style.display = 'none';
    }
  }, 50);
}

// Listen for desktop mouse events
document.addEventListener('mouseup', handleTextSelection);

// Listen for mobile tap events on sentence cards
document.addEventListener('touchend', (e) => {
  const sentenceText = e.target.closest('.sentence-text');
  if (sentenceText) {
    handleMobileTap(e);
  } else {
    // Check for existing text selection on mobile (long-press selection)
    if (window.innerWidth <= 768) {
      handleTextSelection(e);
    }
  }
});

// ===== AI SEARCH (Azure OpenAI via Python backend - JSON response) =====
async function searchAI(word, sentence) {
  try {
    const cfg = getBookConfig();
    const resp = await fetch(`${API_BASE}/api/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, sentence: sentence || '', fromLang: cfg.fromLang, toLang: cfg.toLang })
    });
    const data = await resp.json();
    if (data.error) return { error: data.error };
    // data.result is already a parsed JSON object from the backend
    return data.result;
  } catch (err) {
    return { error: `Could not connect to AI server. Make sure server.py is running.\n${err.message}` };
  }
}

async function searchAITranslate(word, targetLang) {
  if (!targetLang) targetLang = getBookConfig().toLang;
  try {
    const resp = await fetch(`${API_BASE}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, targetLang, fromLang: getBookConfig().fromLang })
    });
    const data = await resp.json();
    if (data.error) return `Error: ${data.error}`;
    return data.result;
  } catch (err) {
    return `Could not connect to AI server.\n${err.message}`;
  }
}

async function askAI(question) {
  try {
    const resp = await fetch(`${API_BASE}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });
    const data = await resp.json();
    if (data.error) return `Error: ${data.error}`;
    return data.result;
  } catch (err) {
    return `Could not connect to AI server.\n${err.message}`;
  }
}

// Format AI JSON result into a readable string for the aiBrief field
function formatAIResult(result) {
  if (typeof result === 'string') return result;
  if (result.error) return `Error: ${result.error}`;
  let text = '';
  if (result.pronunciation) text += `Pronunciation: ${result.pronunciation}\n`;
  if (result.vietnamese_meaning) text += `Vietnamese: ${result.vietnamese_meaning}\n`;
  if (result.english_meaning) text += `English: ${result.english_meaning}\n`;
  if (result.examples && result.examples.length > 0) {
    text += `\nExamples:\n`;
    result.examples.forEach((ex, i) => { text += `${i + 1}. ${ex}\n`; });
  }
  return text.trim();
}

// ===== BOOK MANAGEMENT =====
async function loadBookList() {
  try {
    const resp = await fetch(`${API_BASE}/api/books`);
    const data = await resp.json();
    return data.books || [];
  } catch (err) {
    console.error('Failed to load book list:', err);
    return [];
  }
}

async function saveBookToFile(name, silent = false) {
  const payload = {
    name,
    filename: currentBookFile || undefined,
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

// ===== FLASHCARD REVIEW =====
let flashcardMode = null; // 'vocab' or 'sentence'
let flashcardData = [];
let currentFlashcardIndex = 0;
let isFlashcardFlipped = false;

function showFlashcardReview() {
  if (!currentSectionId) {
    alert('Please select a section first');
    return;
  }
  
  const vocabs = appData.vocabs[currentSectionId] || [];
  const sentences = appData.sentences[currentSectionId] || [];
  
  if (vocabs.length === 0 && sentences.length === 0) {
    alert('No vocabulary or sentences to review in this section');
    return;
  }
  
  // Update counts
  document.getElementById('vocab-count-label').textContent = `${vocabs.length} word${vocabs.length !== 1 ? 's' : ''}`;
  document.getElementById('sentence-count-label').textContent = `${sentences.length} sentence${sentences.length !== 1 ? 's' : ''}`;
  
  // Show overlay
  document.getElementById('flashcard-overlay').style.display = 'flex';
  document.getElementById('flashcard-mode-selector').style.display = 'block';
  document.getElementById('flashcard-content').style.display = 'none';
  flashcardMode = null;
}

function startFlashcardMode(mode) {
  flashcardMode = mode;
  
  if (mode === 'vocab') {
    const vocabs = appData.vocabs[currentSectionId] || [];
    if (vocabs.length === 0) {
      alert('No vocabulary in this section');
      return;
    }
    
    flashcardData = vocabs.map(vocab => {
      let answer = '';
      if (vocab.definitions && vocab.definitions.length > 0) {
        const def = vocab.definitions[0];
        answer = def.vietnamese || def.english || '';
        if (vocab.definitions.length > 1) {
          answer += `\n\n(+${vocab.definitions.length - 1} more definitions)`;
        }
      }
      
      return {
        question: vocab.word,
        answer: answer || 'No definition available',
        audioType: 'vocab',
        audioId: vocab.word
      };
    });
    
    document.getElementById('flashcard-mode-title').innerHTML = '<i class="fas fa-language"></i> Vocabulary Review';
  } else if (mode === 'sentence') {
    const sentences = appData.sentences[currentSectionId] || [];
    if (sentences.length === 0) {
      alert('No sentences in this section');
      return;
    }
    
    flashcardData = sentences.map(sentence => ({
      question: sentence.text,
      answer: sentence.vietnamese || 'No translation available',
      audioType: 'sentence',
      audioId: sentence.id
    }));
    
    document.getElementById('flashcard-mode-title').innerHTML = '<i class="fas fa-align-left"></i> Sentence Review';
  }
  
  currentFlashcardIndex = 0;
  document.getElementById('flashcard-mode-selector').style.display = 'none';
  document.getElementById('flashcard-content').style.display = 'flex';
  showCurrentFlashcard();
}

function showCurrentFlashcard() {
  if (flashcardData.length === 0) return;
  
  const card = flashcardData[currentFlashcardIndex];
  const flashcard = document.getElementById('flashcard');
  
  // Reset flip state
  flashcard.classList.remove('flipped');
  isFlashcardFlipped = false;
  
  // Update content
  document.getElementById('card-front-text').textContent = card.question;
  document.getElementById('card-back-text').textContent = card.answer;
  
  // Update stats
  document.getElementById('current-card-num').textContent = currentFlashcardIndex + 1;
  document.getElementById('total-cards').textContent = flashcardData.length;
  
  // Update button states
  document.getElementById('btn-prev-card').disabled = currentFlashcardIndex === 0;
  const nextBtn = document.getElementById('btn-next-card');
  
  // Change Next button to Finish on last card
  if (currentFlashcardIndex === flashcardData.length - 1) {
    nextBtn.innerHTML = '<i class="fas fa-check"></i> Finish';
    nextBtn.classList.add('btn-finish');
  } else {
    nextBtn.innerHTML = '<i class="fas fa-arrow-right"></i> Next';
    nextBtn.classList.remove('btn-finish');
    nextBtn.disabled = false;
  }
  
  // Check for audio and show play button if available
  checkFlashcardAudio(card);
}

let flashcardAudioPlayer = new Audio();
let currentFlashcardAudioFilename = null;

async function checkFlashcardAudio(card) {
  const playBtn = document.getElementById('btn-play-flashcard-audio');
  currentFlashcardAudioFilename = null;
  playBtn.style.display = 'none';
  
  if (!card.audioType || !card.audioId) return;
  
  try {
    let endpoint, payload;
    if (card.audioType === 'vocab') {
      endpoint = '/api/tts/check';
      payload = { word: card.audioId };
    } else if (card.audioType === 'sentence') {
      endpoint = '/api/tts/check-sentence';
      payload = { sentenceId: card.audioId };
    } else {
      return;
    }
    
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    
    if (data.exists) {
      currentFlashcardAudioFilename = data.filename;
      playBtn.style.display = '';
    }
  } catch (e) {
    console.error('Check flashcard audio error:', e);
  }
}

function playFlashcardAudio() {
  if (!currentFlashcardAudioFilename) return;
  const playBtn = document.getElementById('btn-play-flashcard-audio');
  flashcardAudioPlayer.src = '/audios/' + currentFlashcardAudioFilename + '?t=' + Date.now();
  flashcardAudioPlayer.play().catch(e => console.error('Play error:', e));
  
  playBtn.classList.add('playing');
  flashcardAudioPlayer.onended = () => {
    playBtn.classList.remove('playing');
  };
}

function flipFlashcard() {
  const flashcard = document.getElementById('flashcard');
  flashcard.classList.toggle('flipped');
  isFlashcardFlipped = !isFlashcardFlipped;
}

function nextFlashcard() {
  if (currentFlashcardIndex < flashcardData.length - 1) {
    currentFlashcardIndex++;
    showCurrentFlashcard();
  } else {
    // On last card, Finish button closes the flashcard session
    closeFlashcardReview();
  }
}

function prevFlashcard() {
  if (currentFlashcardIndex > 0) {
    currentFlashcardIndex--;
    showCurrentFlashcard();
  }
}

function shuffleFlashcards() {
  // Fisher-Yates shuffle
  for (let i = flashcardData.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [flashcardData[i], flashcardData[j]] = [flashcardData[j], flashcardData[i]];
  }
  currentFlashcardIndex = 0;
  showCurrentFlashcard();
}

function restartFlashcardReview() {
  currentFlashcardIndex = 0;
  showCurrentFlashcard();
}

function changeFlashcardMode() {
  document.getElementById('flashcard-mode-selector').style.display = 'block';
  document.getElementById('flashcard-content').style.display = 'none';
  flashcardMode = null;
}

function closeFlashcardReview() {
  document.getElementById('flashcard-overlay').style.display = 'none';
  flashcardMode = null;
  flashcardData = [];
  currentFlashcardIndex = 0;
}

// ===== EVENT LISTENERS =====
function initEventListeners() {
  // Close context menus on click elsewhere
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.toc-context-menu')) {
      document.getElementById('toc-context-menu').style.display = 'none';
    }
    if (!e.target.closest('.text-context-menu') && !window.getSelection().toString().trim()) {
      document.getElementById('text-context-menu').style.display = 'none';
    }
  });

  // Add chapter
  document.getElementById('btn-add-chapter').addEventListener('click', addChapter);

  // Add sentence
  document.getElementById('btn-add-sentence').addEventListener('click', addSentence);

  // Section tab switching
  document.querySelectorAll('.section-tab').forEach(btn => {
    btn.addEventListener('click', () => switchSectionTab(btn.dataset.tab));
  });
  
  // Flashcard review
  document.getElementById('btn-review-flashcards').addEventListener('click', showFlashcardReview);
  document.getElementById('btn-mode-vocab').addEventListener('click', () => startFlashcardMode('vocab'));
  document.getElementById('btn-mode-sentence').addEventListener('click', () => startFlashcardMode('sentence'));
  document.getElementById('btn-close-flashcard').addEventListener('click', closeFlashcardReview);
  document.getElementById('btn-flip-card').addEventListener('click', flipFlashcard);
  document.getElementById('flashcard').addEventListener('click', flipFlashcard);
  document.getElementById('btn-next-card').addEventListener('click', nextFlashcard);
  document.getElementById('btn-prev-card').addEventListener('click', prevFlashcard);
  document.getElementById('btn-shuffle-cards').addEventListener('click', shuffleFlashcards);
  document.getElementById('btn-restart-review').addEventListener('click', restartFlashcardReview);
  document.getElementById('btn-change-mode').addEventListener('click', changeFlashcardMode);
  document.getElementById('btn-play-flashcard-audio').addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent card flip when clicking audio button
    playFlashcardAudio();
  });

  // Close vocab list
  document.getElementById('btn-close-vocab-list').addEventListener('click', () => {
    document.getElementById('vocab-list-overlay').style.display = 'none';
  });

  // Book language config
  document.getElementById('btn-book-config').addEventListener('click', openBookConfig);
  document.getElementById('btn-save-book-config').addEventListener('click', saveBookConfig);
  document.getElementById('cfg-voice-preset').addEventListener('change', () => {
    const isCustom = document.getElementById('cfg-voice-preset').value === '__custom__';
    document.getElementById('cfg-voice-custom-row').style.display = isCustom ? '' : 'none';
  });

  // Vocab Bin
  document.getElementById('btn-vocab-bin').addEventListener('click', openVocabBin);
  document.getElementById('btn-close-vocab-bin').addEventListener('click', closeVocabBin);
  document.getElementById('btn-bin-delete-all').addEventListener('click', deleteAllFromBin);
  document.getElementById('vocab-bin-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('vocab-bin-overlay')) closeVocabBin();
  });

  // Close vocab panel
  document.getElementById('btn-close-vocab-panel').addEventListener('click', closeDetailPanel);

  // Audio TTS buttons
  document.getElementById('btn-generate-audio').addEventListener('click', generateAudio);
  document.getElementById('btn-play-audio').addEventListener('click', playAudio);

  // Sentence audio buttons
  document.getElementById('btn-generate-sentence-audio').addEventListener('click', generateSentenceAudio);
  document.getElementById('btn-play-sentence-audio').addEventListener('click', playSentenceAudio);

  // Close sentence panel
  document.getElementById('btn-close-sentence-panel').addEventListener('click', closeDetailPanel);
  
  // Voice recording buttons
  document.getElementById('btn-record-voice').addEventListener('click', startRecording);
  document.getElementById('btn-stop-recording').addEventListener('click', stopRecording);
  document.getElementById('btn-play-recording').addEventListener('click', playRecording);
  document.getElementById('btn-delete-recording').addEventListener('click', deleteRecording);

  // AI Translate Sentence
  document.getElementById('btn-ai-translate-sentence').addEventListener('click', aiTranslateSentence);

  // Edit sentence panel fields
  document.querySelectorAll('.btn-edit-sp').forEach(btn => {
    btn.addEventListener('click', () => {
      editSentenceField(btn.dataset.field);
    });
  });

  // Save sentence
  document.getElementById('btn-save-sentence').addEventListener('click', () => {
    const text = document.getElementById('input-sentence').value;
    saveSentence(text);
    hideModal('modal-sentence');
  });

  // Save TOC item
  document.getElementById('btn-save-toc').addEventListener('click', () => {
    const name = document.getElementById('input-toc-name').value.trim();
    if (!name) return;
    const cb = document.getElementById('btn-save-toc')._callback;
    if (cb) cb(name);
    hideModal('modal-toc');
  });

  // Enter key in TOC input
  document.getElementById('input-toc-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('btn-save-toc').click();
    }
  });

  // Enter key in sentence input (Ctrl+Enter to save)
  document.getElementById('input-sentence').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      document.getElementById('btn-save-sentence').click();
    }
  });

  // TOC context menu actions
  document.getElementById('ctx-add-sub').addEventListener('click', () => {
    document.getElementById('toc-context-menu').style.display = 'none';
    if (tocContextTarget) addSubSection(tocContextTarget);
  });

  document.getElementById('ctx-rename').addEventListener('click', () => {
    document.getElementById('toc-context-menu').style.display = 'none';
    if (tocContextTarget) renameSection(tocContextTarget);
  });

  document.getElementById('ctx-delete').addEventListener('click', () => {
    document.getElementById('toc-context-menu').style.display = 'none';
    if (tocContextTarget) deleteSection(tocContextTarget);
  });

  // Text context menu: Add as vocab
  document.getElementById('ctx-add-vocab').addEventListener('click', () => {
    document.getElementById('text-context-menu').style.display = 'none';
    if (selectedTextForVocab) {
      showVocabModal(selectedTextForVocab);
    }
  });

  // Save vocab from modal
  document.getElementById('btn-save-vocab').addEventListener('click', () => {
    const word = document.getElementById('input-vocab-word').value;
    const translation = document.getElementById('input-vocab-translation').value;
    const explanation = document.getElementById('input-vocab-explanation').value;
    addVocab(word, translation, explanation, selectedSentenceIdForVocab);
    hideModal('modal-vocab');
  });

  // AI Explain in vocab modal — auto-fills Translation and Explanation from JSON response
  document.getElementById('btn-ai-explain').addEventListener('click', async () => {
    const word = document.getElementById('input-vocab-word').value;
    const btn = document.getElementById('btn-ai-explain');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...';

    // Find the sentence context for this vocab
    let sentenceText = '';
    if (selectedSentenceIdForVocab && currentSectionId) {
      const sentences = appData.sentences[currentSectionId] || [];
      const sentence = sentences.find(s => s.id === selectedSentenceIdForVocab);
      if (sentence) sentenceText = sentence.text;
    }

    const result = await searchAI(word, sentenceText);

    if (result && typeof result === 'object' && !result.error) {
      // Auto-fill Translation with Vietnamese meaning
      document.getElementById('input-vocab-translation').value = result.vietnamese_meaning || '';
      // Auto-fill Explanation with English meaning
      document.getElementById('input-vocab-explanation').value = result.english_meaning || '';
    } else {
      // Fallback: put full text in explanation
      const text = result.error || (typeof result === 'string' ? result : JSON.stringify(result));
      document.getElementById('input-vocab-explanation').value = text;
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-robot"></i> AI Explain';
  });

  // Edit vocab fields in panel
  document.querySelectorAll('.btn-edit-field').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.field;
      const vocabs = appData.vocabs[currentVocabSectionId] || [];
      const vocab = vocabs.find(v => v.id === currentVocabId);
      if (vocab) {
        showEditFieldModal(field, vocab[field]);
      }
    });
  });

  // Save edited field
  document.getElementById('btn-save-field').addEventListener('click', () => {
    const value = document.getElementById('input-edit-field').value;
    if (editingFieldName && editingFieldName.startsWith('__sentence__')) {
      // Saving a sentence field
      const dataField = editingFieldName.replace('__sentence__', '');
      if (currentSentenceDetailId && currentSectionId) {
        const sentences = appData.sentences[currentSectionId] || [];
        const sentence = sentences.find(s => s.id === currentSentenceDetailId);
        if (sentence) {
          sentence[dataField] = value;
          saveData();
          if (dataField === 'vietnamese') document.getElementById('sp-vietnamese').textContent = value;
          if (dataField === 'spNotes') document.getElementById('sp-notes').textContent = value;
        }
      }
    } else if (editingFieldName) {
      updateVocabField(editingFieldName, value);
    }
    hideModal('modal-edit-field');
  });

  // Add definition
  document.getElementById('btn-add-definition').addEventListener('click', showAddDefinitionModal);

  // Save definition
  document.getElementById('btn-save-definition').addEventListener('click', saveDefinition);

  // Search AI in vocab panel — auto-fills fields from JSON
  document.getElementById('btn-search-ai').addEventListener('click', async () => {
    if (!currentVocabId || !currentVocabSectionId) return;
    const vocabs = appData.vocabs[currentVocabSectionId] || [];
    const vocab = vocabs.find(v => v.id === currentVocabId);
    if (!vocab) return;

    const btn = document.getElementById('btn-search-ai');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...';

    // Find sentence context
    let sentenceText = '';
    if (vocab.sentenceId && currentVocabSectionId) {
      const sentences = appData.sentences[currentVocabSectionId] || [];
      const sentence = sentences.find(s => s.id === vocab.sentenceId);
      if (sentence) sentenceText = sentence.text;
    }

    const result = await searchAI(vocab.word, sentenceText);

    if (result && typeof result === 'object' && !result.error) {
      // Auto-fill pronunciation
      if (result.pronunciation) updateVocabField('pronunciation', result.pronunciation);
      // Add/update first definition with Vietnamese and English meanings
      if (!vocab.definitions) vocab.definitions = [];
      if (vocab.definitions.length === 0) {
        vocab.definitions.push({
          pos: '',
          vietnamese: result.vietnamese_meaning || '',
          english: result.english_meaning || '',
          example: (result.examples && result.examples[0]) || ''
        });
      } else {
        // Update first definition if it's empty
        const first = vocab.definitions[0];
        if (!first.vietnamese) first.vietnamese = result.vietnamese_meaning || '';
        if (!first.english) first.english = result.english_meaning || '';
        if (!first.example && result.examples && result.examples[0]) first.example = result.examples[0];
      }
      saveData();
      renderDefinitionsList(vocab);
      // Put formatted full result in AI Brief
      updateVocabField('aiBrief', formatAIResult(result));
    } else {
      const text = result.error || (typeof result === 'string' ? result : JSON.stringify(result));
      updateVocabField('aiBrief', text);
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-robot"></i> Search AI';
  });

  // Delete vocab from panel
  document.getElementById('btn-delete-vocab').addEventListener('click', deleteVocab);

  // Close modals
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal');
      if (modal) modal.style.display = 'none';
    });
  });

  // Close modals on backdrop click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  });

  // Close vocab list overlay on backdrop click
  document.getElementById('vocab-list-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('vocab-list-overlay')) {
      e.target.style.display = 'none';
    }
  });

  // Escape key to close things
  document.addEventListener('keydown', (e) => {
    // Let mindmap handle its own Escape
    const mmOverlay = document.getElementById('mindmap-overlay');
    if (mmOverlay && mmOverlay.style.display !== 'none') return;

    if (e.key === 'Escape') {
      document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
      document.getElementById('text-context-menu').style.display = 'none';
      document.getElementById('toc-context-menu').style.display = 'none';
      document.getElementById('vocab-list-overlay').style.display = 'none';
      closeDetailPanel();
      
      // Close flashcard overlay
      if (document.getElementById('flashcard-overlay').style.display !== 'none') {
        closeFlashcardReview();
      }
    }
    
    // Flashcard keyboard shortcuts
    if (document.getElementById('flashcard-overlay').style.display !== 'none' && 
        document.getElementById('flashcard-content').style.display !== 'none') {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        prevFlashcard();
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        nextFlashcard();
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        flipFlashcard();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        restartFlashcardReview();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        shuffleFlashcards();
      }
    }
  });
}

// ===== INIT =====
function init() {
  // Book management buttons - attach early before other initialization
  const newBookBtn = document.getElementById('btn-new-book');
  if (newBookBtn) {
    newBookBtn.addEventListener('click', createNewBook);
  } else {
    console.error('btn-new-book not found in DOM!');
  }

  // Import book from ZIP — show naming modal first
  const importBtn = document.getElementById('btn-import-book');
  const importInput = document.getElementById('input-import-zip');
  if (importBtn && importInput) {
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', openImportModal);
  }

  // Confirm import modal
  document.getElementById('btn-confirm-import-book').addEventListener('click', confirmImportBook);

  // Rename from within book (current-book-bar pencil)
  document.getElementById('btn-rename-current-book').addEventListener('click', () => {
    if (currentBookFile && currentBookName) {
      openRenameBook(currentBookFile, currentBookName);
    }
  });

  // Rename confirm modal
  document.getElementById('btn-confirm-rename-book').addEventListener('click', confirmRenameBook);
  document.getElementById('input-rename-book').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmRenameBook();
  });

  // Sidebar back-to-books button
  document.getElementById('btn-sidebar-back-books').addEventListener('click', () => {
    currentSectionId = null;
    closeDetailPanel();
    showBookListScreen();
  });
  
  document.getElementById('btn-create-book-confirm').addEventListener('click', () => {
    const btn = document.getElementById('btn-create-book-confirm');
    if (btn._saveMode) {
      // We were asking for a name to save
      const name = document.getElementById('input-book-name').value.trim();
      if (!name) return;
      hideModal('modal-new-book');
      currentBookName = name;
      localStorage.setItem(BOOK_NAME_KEY, currentBookName);
      saveBookToFile(currentBookName);
      btn._saveMode = false;
    } else {
      confirmCreateBook();
    }
  });
  
  // Enter key in book name input
  document.getElementById('input-book-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('btn-create-book-confirm').click();
    }
  });

  document.getElementById('btn-save-book').addEventListener('click', saveCurrentBook);
  document.getElementById('btn-back-to-books').addEventListener('click', () => {
    currentSectionId = null;
    closeDetailPanel();
    showBookListScreen();
  });
  document.getElementById('btn-save-book-inline').addEventListener('click', saveCurrentBook);
  
  // Now initialize other event listeners
  initEventListeners();
  initMindmapEvents();

  // Sentence filter
  document.getElementById('input-sentence-filter').addEventListener('input', filterSentences);

  // Clear filter button
  document.getElementById('btn-clear-filter').addEventListener('click', () => {
    document.getElementById('input-sentence-filter').value = '';
    filterSentences();
  });

  // Mobile menu toggle
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  
  function toggleSidebar() {
    sidebar.classList.toggle('mobile-open');
    sidebarBackdrop.classList.toggle('active');
  }
  
  function closeSidebar() {
    sidebar.classList.remove('mobile-open');
    sidebarBackdrop.classList.remove('active');
  }
  
  sidebarToggle.addEventListener('click', toggleSidebar);
  sidebarBackdrop.addEventListener('click', closeSidebar);
  
  // Close sidebar when clicking on a TOC item on mobile
  document.addEventListener('click', (e) => {
    if (e.target.closest('.toc-item-row') && window.innerWidth <= 768) {
      closeSidebar();
    }
  });
  
  // Mobile hint dismiss functionality
  const mobileHint = document.getElementById('mobile-selection-hint');
  if (mobileHint) {
    // Make hint dismissible by clicking on it
    mobileHint.addEventListener('click', () => {
      mobileHint.style.display = 'none';
      localStorage.setItem('mobile-hint-dismissed', 'true');
    });
  }

  // Decide which screen to show on startup
  initializeApp();
}

async function initializeApp() {
  // Try to load last book from server if available
  if (currentBookFile) {
    try {
      const response = await fetch(`${API_BASE}/api/books/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: currentBookFile })
      });
      
      if (response.ok) {
        const result = await response.json();
        appData = result.data || { toc: [], sentences: {}, vocabs: {} };
        currentBookName = result.name || currentBookName;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
        localStorage.setItem(BOOK_NAME_KEY, currentBookName);
        console.log('✓ Loaded book from server:', currentBookName);
        enterBookView();
        return;
      }
    } catch (err) {
      console.warn('Could not load from server, using local data:', err);
    }
  }
  
  // Check if there are any books on server
  try {
    const books = await loadBookList();
    if (books.length > 0 && !currentBookName) {
      // Show book list if there are books but none selected
      showBookListScreen();
      return;
    }
  } catch (err) {
    console.warn('Could not load book list:', err);
  }
  
  // Fallback to local data or show book list
  if (currentBookName && appData.toc.length > 0) {
    enterBookView();
  } else {
    showBookListScreen();
  }
}

function filterSentences() {
  const query = document.getElementById('input-sentence-filter').value.toLowerCase().trim();
  const container = document.getElementById('sentences-container');
  const cards = container.querySelectorAll('.sentence-card');
  let visibleCount = 0;

  // Show/hide clear button
  const clearBtn = document.getElementById('btn-clear-filter');
  clearBtn.style.display = query ? 'block' : 'none';

  cards.forEach(card => {
    const text = card.querySelector('.sentence-text').textContent.toLowerCase();
    if (!query || text.includes(query)) {
      card.classList.remove('hidden-by-filter');
      visibleCount++;
    } else {
      card.classList.add('hidden-by-filter');
    }
  });

  // Show/hide "no results" message
  let noResultsEl = container.querySelector('.no-filter-results');
  if (visibleCount === 0 && cards.length > 0 && query) {
    if (!noResultsEl) {
      noResultsEl = document.createElement('p');
      noResultsEl.className = 'no-filter-results';
      container.appendChild(noResultsEl);
    }
    noResultsEl.textContent = `No sentences matching "${query}"`;
    noResultsEl.style.display = 'block';
  } else if (noResultsEl) {
    noResultsEl.style.display = 'none';
  }
}

// ===== MINDMAP =====
let mindmapData = null;          // current mindmap tree
let mindmapVocabId = null;       // vocab id being edited
let mindmapSelectedId = null;    // currently selected node id
let mindmapEditingId = null;     // node being inline-edited
let mindmapLayout = 'tree';      // 'tree' | 'radial' | 'vertical'
let mindmapHistory = [];         // stack of { vocabId, sectionId } for back navigation
let mindmapPanX = 0;
let mindmapPanY = 0;
let mindmapZoom = 1;
let mmIsPanning = false;
let mmPanStart = { x: 0, y: 0, px: 0, py: 0 };
let mmHoverTimeout = null;
let mmHoveredNodeId = null;
let mmDragNodeId = null;
let mmDragOverNodeId = null;
let mmIsDragging = false;
let mmDragGhost = null;
let mmDragStartPos = { x: 0, y: 0 };

function createMindmapNode(text, parentId) {
  return { id: uid(), text: text || '', desc: '', image: '', imageSize: 'small', imageHidden: false, collapsed: false, children: [], _parentId: parentId || null };
}

function initMindmapData(word) {
  const root = createMindmapNode(word, null);
  root.id = 'root';
  return root;
}

function getMindmaps() {
  if (!appData.mindmaps) appData.mindmaps = {};
  return appData.mindmaps;
}

function getMindmapLayout(vocabId) {
  if (!appData.mindmapLayouts) appData.mindmapLayouts = {};
  return appData.mindmapLayouts[vocabId] || 'tree';
}

function setMindmapLayout(vocabId, layout) {
  if (!appData.mindmapLayouts) appData.mindmapLayouts = {};
  appData.mindmapLayouts[vocabId] = layout;
  saveData();
}

function updateMindmapBackBtn() {
  const btn = document.getElementById('btn-mm-back');
  if (btn) btn.style.display = mindmapHistory.length > 0 ? '' : 'none';
}

function goBackMindmap() {
  if (mindmapHistory.length === 0) return;
  const prev = mindmapHistory.pop();
  currentVocabId = prev.vocabId;
  currentVocabSectionId = prev.sectionId;
  openMindmap(false); // false = don't push to history
}

function openMindmap(pushHistory) {
  if (!currentVocabId || !currentVocabSectionId) return;
  const vocabs = appData.vocabs[currentVocabSectionId] || [];
  const vocab = vocabs.find(v => v.id === currentVocabId);
  if (!vocab) return;

  const mindmaps = getMindmaps();
  mindmapVocabId = currentVocabId;
  mindmapLayout = getMindmapLayout(currentVocabId);

  const overlay = document.getElementById('mindmap-overlay');
  document.getElementById('mindmap-title').textContent = `Mindmap: ${vocab.word}`;

  // Set layout switcher active state
  document.querySelectorAll('.mm-layout-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.layout === mindmapLayout);
  });

  updateMindmapBackBtn();

  if (mindmaps[currentVocabId]) {
    mindmapData = JSON.parse(JSON.stringify(mindmaps[currentVocabId]));
    rebuildParentRefs(mindmapData, null);
    overlay.style.display = 'flex';
    mindmapSelectedId = 'root';
    mindmapEditingId = null;
    resetMindmapPan();
    renderMindmap();
    closeMindmapSidePanel();
  } else {
    overlay.style.display = 'flex';
    mindmapData = null;
    mindmapSelectedId = null;
    mindmapEditingId = null;
    closeMindmapSidePanel();
    showMindmapCreatePrompt(vocab.word);
  }
}

function showMindmapCreatePrompt(word) {
  const canvas = document.getElementById('mindmap-canvas');
  const panLayer = document.getElementById('mindmap-pan-layer');
  if (panLayer) {
    panLayer.innerHTML = '';
  }
  canvas.innerHTML = `
    <div class="mindmap-create-prompt">
      <i class="fas fa-project-diagram"></i>
      <p>No mindmap exists for "<strong>${escapeHtml(word)}</strong>"</p>
      <button id="btn-create-mindmap" class="btn btn-primary"><i class="fas fa-plus"></i> Create Mindmap</button>
    </div>
  `;
  document.getElementById('btn-create-mindmap').addEventListener('click', () => {
    mindmapData = initMindmapData(word);
    mindmapSelectedId = 'root';
    canvas.innerHTML = '<div id="mindmap-pan-layer" class="mindmap-pan-layer"><svg id="mindmap-svg" class="mindmap-svg"></svg><div id="mindmap-nodes" class="mindmap-nodes"></div></div>';
    resetMindmapPan();
    renderMindmap();
    saveMindmap();
    openMindmapSidePanel('root');
  });
}

function closeMindmap() {
  document.getElementById('mindmap-overlay').style.display = 'none';
  document.getElementById('mm-hover-menu').style.display = 'none';
  mindmapData = null;
  mindmapVocabId = null;
  mindmapSelectedId = null;
  mindmapEditingId = null;
  mindmapHistory = [];
  mindmapZoom = 1;
  updateMindmapBackBtn();
  closeMindmapSidePanel();
}

function saveMindmap() {
  if (!mindmapVocabId || !mindmapData) return;
  const mindmaps = getMindmaps();
  mindmaps[mindmapVocabId] = cleanMindmapForSave(mindmapData);
  saveData();
}

function cleanMindmapForSave(node) {
  const obj = {
    id: node.id,
    text: node.text,
    desc: node.desc || '',
    collapsed: !!node.collapsed,
    children: (node.children || []).map(c => cleanMindmapForSave(c))
  };
  if (node.image) { obj.image = node.image; obj.imageSize = node.imageSize || 'small'; if (node.imageHidden) obj.imageHidden = true; }
  if (node.vocabLink) { obj.vocabLink = { vocabId: node.vocabLink.vocabId, sectionId: node.vocabLink.sectionId }; }
  return obj;
}

function rebuildParentRefs(node, parentId) {
  node._parentId = parentId;
  if (!node.desc) node.desc = '';
  if (!node.image) node.image = '';
  if (!node.imageSize) node.imageSize = 'small';
  if (node.imageHidden === undefined) node.imageHidden = false;
  if (node.collapsed === undefined) node.collapsed = false;
  if (!node.vocabLink) node.vocabLink = null;
  (node.children || []).forEach(c => rebuildParentRefs(c, node.id));
}

function findNode(node, id) {
  if (node.id === id) return node;
  for (const child of (node.children || [])) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

// Returns true if targetId is inside the subtree of ancestorNode (not the ancestor itself)
function isDescendant(ancestorNode, targetId) {
  const kids = dispChildren(ancestorNode);
  for (const child of kids) {
    if (child.id === targetId) return true;
    if (isDescendant(child, targetId)) return true;
  }
  return false;
}

function executeMindmapDrop() {
  // Clean up visual state regardless
  document.querySelectorAll('.mm-node-drag-over, .mm-node-drag-source')
    .forEach(el => { el.classList.remove('mm-node-drag-over'); el.classList.remove('mm-node-drag-source'); });
  if (mmDragGhost) { mmDragGhost.remove(); mmDragGhost = null; }

  if (!mmDragNodeId || !mmDragOverNodeId) return;
  if (mmDragNodeId === mmDragOverNodeId) return;

  const dragNode = findNode(mindmapData, mmDragNodeId);
  if (!dragNode || dragNode._readonly) return;
  const dropTarget = findNode(mindmapData, mmDragOverNodeId);
  if (!dropTarget || dropTarget._readonly || dropTarget.vocabLink) return;

  // Prevent dropping onto a descendant of the dragged node
  if (isDescendant(dragNode, mmDragOverNodeId)) return;

  const currentParent = findParentNode(mindmapData, mmDragNodeId);
  if (!currentParent) return;

  // Remove from current parent
  const idx = currentParent.children.findIndex(c => c.id === mmDragNodeId);
  if (idx !== -1) currentParent.children.splice(idx, 1);

  // Attach to drop target
  if (!dropTarget.children) dropTarget.children = [];
  dropTarget.children.push(dragNode);
  dragNode._parentId = dropTarget.id;

  mindmapSelectedId = mmDragNodeId;
  saveMindmap();
  renderMindmap();
  openMindmapSidePanel(mmDragNodeId);
}

function findParentNode(node, childId) {
  for (const child of (node.children || [])) {
    if (child.id === childId) return node;
    const found = findParentNode(child, childId);
    if (found) return found;
  }
  return null;
}

// ===== LINKED CHILDREN RESOLUTION =====
// Returns the children to display: live linked children from the linked mindmap (if vocabLink exists), else own children
function dispChildren(node) {
  if (node._linkedChildren !== undefined && node._linkedChildren !== null) return node._linkedChildren;
  return node.children || [];
}

// Call before every layout/render pass. Injects live children from linked mindmaps (not saved).
function resolveLinkedChildren(node, visited) {
  if (!visited) visited = new Set();
  if (visited.has(node.id)) return; // prevent cycles
  visited.add(node.id);

  node._linkedChildren = null;
  if (node.vocabLink && node.vocabLink.vocabId) {
    const linkedMM = getMindmaps()[node.vocabLink.vocabId];
    if (linkedMM) {
      const kids = JSON.parse(JSON.stringify(linkedMM.children || []));
      markNodesReadonly(kids, node.vocabLink);
      node._linkedChildren = kids;
      // Also resolve nested links within live children
      node._linkedChildren.forEach(c => resolveLinkedChildren(c, new Set(visited)));
    } else {
      node._linkedChildren = [];
    }
  }
  (node.children || []).forEach(c => resolveLinkedChildren(c, visited));
}

function markNodesReadonly(nodes, fromVocabLink) {
  nodes.forEach(n => {
    n._readonly = true;
    n._fromVocabLink = fromVocabLink;
    if (n.children && n.children.length) markNodesReadonly(n.children, fromVocabLink);
  });
}

// ===== LAYOUT ALGORITHMS =====
const MM_IMAGE_SIZES = { small: 60, medium: 120, large: 200, xl: 320 };

function estimateNodeWidth(text, level, node) {
  if (node && node.image && !node.imageHidden) {
    const imgSize = MM_IMAGE_SIZES[node.imageSize || 'small'];
    return Math.max(imgSize + 24, 80);
  }
  const fontSize = level === 0 ? 16 : 14;
  const charWidth = fontSize * 0.65;
  return Math.max(80, text.length * charWidth + 32);
}

function getNodeTotalHeight(hasDesc, node) {
  if (node && node.image && !node.imageHidden) {
    const imgSize = MM_IMAGE_SIZES[node.imageSize || 'small'];
    const textH = node.text ? 22 : 0;  // text label under image
    return imgSize + 16 + textH + (hasDesc ? 18 : 0);
  }
  return hasDesc ? 58 : 40;  // label + desc
}
function getRootTotalHeight(hasDesc, node) {
  if (node && node.image && !node.imageHidden) {
    const imgSize = MM_IMAGE_SIZES[node.imageSize || 'small'];
    const textH = node.text ? 22 : 0;
    return imgSize + 20 + textH + (hasDesc ? 22 : 0);
  }
  return hasDesc ? 70 : 48;
}

// --- TREE layout (horizontal right-branching) ---
function layoutTree(root) {
  const positions = {};
  const GAP_H = 70, GAP_V = 18;

  function calcHeight(node, lvl) {
    const h = lvl === 0 ? getRootTotalHeight(!!node.desc, node) : getNodeTotalHeight(!!node.desc, node);
    const kids = dispChildren(node);
    if (!kids.length || node.collapsed) return h;
    let total = 0;
    kids.forEach((c, i) => { total += calcHeight(c, lvl + 1); if (i > 0) total += GAP_V; });
    return Math.max(h, total);
  }

  function assign(node, lvl, x, yMin, yMax) {
    const h = lvl === 0 ? getRootTotalHeight(!!node.desc, node) : getNodeTotalHeight(!!node.desc, node);
    const w = estimateNodeWidth(node.text, lvl, node);
    const y = (yMin + yMax) / 2 - h / 2;
    positions[node.id] = { x, y, w, h };
    const kids = dispChildren(node);
    if (!kids.length || node.collapsed) return;
    const cX = x + w + GAP_H;
    const cHeights = kids.map(c => calcHeight(c, lvl + 1));
    const totalCH = cHeights.reduce((a, b) => a + b, 0) + (kids.length - 1) * GAP_V;
    let cY = (yMin + yMax) / 2 - totalCH / 2;
    kids.forEach((child, i) => {
      const cBot = cY + cHeights[i];
      assign(child, lvl + 1, cX, cY, cBot);
      cY = cBot + GAP_V;
    });
  }

  const canvas = document.getElementById('mindmap-canvas');
  const ch = canvas.clientHeight || 600;
  const tot = calcHeight(root, 0);
  assign(root, 0, 80, ch / 2 - tot / 2, ch / 2 + tot / 2);
  return positions;
}

// --- VERTICAL layout (top-down tree) ---
function layoutVertical(root) {
  const positions = {};
  const GAP_H = 30, GAP_V = 70;

  function calcWidth(node, lvl) {
    const w = estimateNodeWidth(node.text, lvl, node);
    const kids = dispChildren(node);
    if (!kids.length || node.collapsed) return w;
    let total = 0;
    kids.forEach((c, i) => { total += calcWidth(c, lvl + 1); if (i > 0) total += GAP_H; });
    return Math.max(w, total);
  }

  function assign(node, lvl, y, xMin, xMax) {
    const w = estimateNodeWidth(node.text, lvl, node);
    const h = lvl === 0 ? getRootTotalHeight(!!node.desc, node) : getNodeTotalHeight(!!node.desc, node);
    const x = (xMin + xMax) / 2 - w / 2;
    positions[node.id] = { x, y, w, h };
    const kids = dispChildren(node);
    if (!kids.length || node.collapsed) return;
    const cY = y + h + GAP_V;
    const cWidths = kids.map(c => calcWidth(c, lvl + 1));
    const totalCW = cWidths.reduce((a, b) => a + b, 0) + (kids.length - 1) * GAP_H;
    let cX = (xMin + xMax) / 2 - totalCW / 2;
    kids.forEach((child, i) => {
      const cRight = cX + cWidths[i];
      assign(child, lvl + 1, cY, cX, cRight);
      cX = cRight + GAP_H;
    });
  }

  const canvas = document.getElementById('mindmap-canvas');
  const cw = canvas.clientWidth || 800;
  const tot = calcWidth(root, 0);
  assign(root, 0, 60, cw / 2 - tot / 2, cw / 2 + tot / 2);
  return positions;
}

// --- RADIAL layout ---
function layoutRadial(root) {
  const positions = {};

  function countLeaves(node) {
    const kids = dispChildren(node);
    if (!kids.length || node.collapsed) return 1;
    return kids.reduce((s, c) => s + countLeaves(c), 0);
  }

  const canvas = document.getElementById('mindmap-canvas');
  const cw = canvas.clientWidth || 800;
  const ch = canvas.clientHeight || 600;
  const cx = cw / 2, cy = ch / 2;

  const rootW = estimateNodeWidth(root.text, 0, root);
  const rootH = getRootTotalHeight(!!root.desc, root);
  positions[root.id] = { x: cx - rootW / 2, y: cy - rootH / 2, w: rootW, h: rootH };

  function assignRadial(children, lvl, startAngle, endAngle, radius) {
    if (!children || children.length === 0) return;
    const totalLeaves = children.reduce((s, c) => s + countLeaves(c), 0);
    let angle = startAngle;
    children.forEach(child => {
      const leaves = countLeaves(child);
      const sweep = (endAngle - startAngle) * (leaves / totalLeaves);
      const midAngle = angle + sweep / 2;
      const w = estimateNodeWidth(child.text, lvl, child);
      const h = getNodeTotalHeight(!!child.desc, child);
      const px = cx + radius * Math.cos(midAngle) - w / 2;
      const py = cy + radius * Math.sin(midAngle) - h / 2;
      positions[child.id] = { x: px, y: py, w, h };
      const childKids = dispChildren(child);
      if (childKids.length > 0 && !child.collapsed) {
        assignRadial(childKids, lvl + 1, angle, angle + sweep, radius + 160);
      }
      angle += sweep;
    });
  }

  const rootKids = dispChildren(root);
  if (rootKids.length > 0) {
    assignRadial(rootKids, 1, -Math.PI, Math.PI, 200);
  }

  return positions;
}

function computeLayout(root) {
  switch (mindmapLayout) {
    case 'vertical': return layoutVertical(root);
    case 'radial':   return layoutRadial(root);
    default:         return layoutTree(root);
  }
}

// ===== PAN / ZOOM =====
function resetMindmapPan() {
  mindmapPanX = 0;
  mindmapPanY = 0;
  mindmapZoom = 1;
  applyPanTransform();
}

function applyPanTransform() {
  const pl = document.getElementById('mindmap-pan-layer');
  if (pl) pl.style.transform = `translate(${mindmapPanX}px, ${mindmapPanY}px) scale(${mindmapZoom})`;
}

// ===== RENDER =====
function renderMindmap() {
  if (!mindmapData) return;
  resolveLinkedChildren(mindmapData);   // inject live linked children before layout
  const positions = computeLayout(mindmapData);
  const nodesContainer = document.getElementById('mindmap-nodes');
  if (!nodesContainer) return;
  nodesContainer.innerHTML = '';

  // Find bounding box including negative positions
  const PADDING = 60;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  Object.values(positions).forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x + p.w > maxX) maxX = p.x + p.w;
    if (p.y + p.h > maxY) maxY = p.y + p.h;
  });

  // Shift all positions so nothing is negative (add padding)
  const offsetX = minX < PADDING ? PADDING - minX : 0;
  const offsetY = minY < PADDING ? PADDING - minY : 0;
  if (offsetX !== 0 || offsetY !== 0) {
    Object.values(positions).forEach(p => {
      p.x += offsetX;
      p.y += offsetY;
    });
    maxX += offsetX;
    maxY += offsetY;
  }

  const svgW = Math.max(maxX + PADDING, 800);
  const svgH = Math.max(maxY + PADDING, 600);

  nodesContainer.style.width = svgW + 'px';
  nodesContainer.style.height = svgH + 'px';

  const svg = document.getElementById('mindmap-svg');
  if (!svg) return;
  svg.setAttribute('width', svgW);
  svg.setAttribute('height', svgH);
  svg.style.width = svgW + 'px';
  svg.style.height = svgH + 'px';
  svg.innerHTML = '';

  const panLayer = document.getElementById('mindmap-pan-layer');
  if (panLayer) {
    panLayer.style.width = svgW + 'px';
    panLayer.style.height = svgH + 'px';
  }

  drawConnections(mindmapData, positions, svg);
  renderNodes(mindmapData, positions, nodesContainer, 0);
}

function drawConnections(node, positions, svg, readonly) {
  const p = positions[node.id];
  if (!p) return;
  if (node.collapsed) return;
  dispChildren(node).forEach(child => {
    const cp = positions[child.id];
    if (!cp) return;

    let x1, y1, x2, y2, d;
    if (mindmapLayout === 'vertical') {
      x1 = p.x + p.w / 2; y1 = p.y + p.h;
      x2 = cp.x + cp.w / 2; y2 = cp.y;
      const midY = (y1 + y2) / 2;
      d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
    } else if (mindmapLayout === 'radial') {
      x1 = p.x + p.w / 2; y1 = p.y + p.h / 2;
      x2 = cp.x + cp.w / 2; y2 = cp.y + cp.h / 2;
      const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
      d = `M ${x1} ${y1} Q ${midX} ${y1}, ${x2} ${y2}`;
    } else {
      x1 = p.x + p.w; y1 = p.y + p.h / 2;
      x2 = cp.x; y2 = cp.y + cp.h / 2;
      const midX = (x1 + x2) / 2;
      d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    // Use dashed style for connections into read-only (linked) subtrees
    const childReadonly = readonly || !!child._readonly;
    if (childReadonly) path.setAttribute('class', 'mm-readonly-path');
    svg.appendChild(path);
    drawConnections(child, positions, svg, childReadonly);
  });
}

let mmClickTimer = null;

function buildDescEl(descText) {
  const descEl = document.createElement('div');
  descEl.className = 'mm-node-desc';
  const span = document.createElement('span');
  span.className = 'mm-desc-text';
  span.textContent = descText;
  descEl.appendChild(span);
  // After append, check if overflow and enable marquee
  requestAnimationFrame(() => {
    if (span.scrollWidth > descEl.clientWidth) {
      descEl.classList.add('marquee');
      // Duplicate text for seamless loop
      const dup = document.createElement('span');
      dup.className = 'mm-desc-text';
      dup.textContent = descText;
      span.textContent = descText + '\u00A0\u00A0\u00A0\u2022\u00A0\u00A0\u00A0';
      // Wrap both in a sliding container
      const wrapper = document.createElement('span');
      wrapper.className = 'mm-desc-text';
      wrapper.textContent = descText + '\u00A0\u00A0\u00A0\u2022\u00A0\u00A0\u00A0' + descText + '\u00A0\u00A0\u00A0\u2022\u00A0\u00A0\u00A0';
      descEl.innerHTML = '';
      descEl.appendChild(wrapper);
    }
  });
  return descEl;
}

function renderNodes(node, positions, container, level, readonly) {
  readonly = readonly || !!node._readonly;
  const p = positions[node.id];
  if (!p) return;

  const el = document.createElement('div');
  el.className = `mm-node ${level === 0 ? 'root' : 'level-' + Math.min(level, 4)}`;
  if (readonly) el.classList.add('mm-node-readonly');
  if (mindmapSelectedId === node.id) el.classList.add('selected');
  el.style.left = p.x + 'px';
  el.style.top = p.y + 'px';
  el.dataset.nodeId = node.id;

  // Label area
  const labelEl = document.createElement('div');
  labelEl.className = 'mm-node-label';

  if (!readonly && mindmapEditingId === node.id) {
    // ---- INLINE EDITING ----
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'mm-node-input';
    input.value = node.text;
    input.placeholder = 'Type here...';
    input.style.width = Math.max(80, node.text.length * 9 + 20) + 'px';
    labelEl.appendChild(input);
    el.appendChild(labelEl);

    if (node.desc) el.appendChild(buildDescEl(node.desc));

    container.appendChild(el);
    setTimeout(() => {
      input.focus();
      if (node.text) input.select();
    }, 0);

    let blurHandled = false;
    input.addEventListener('blur', () => {
      if (blurHandled) return;
      blurHandled = true;
      finishNodeEdit(node.id, input.value);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); blurHandled = true; finishNodeEdit(node.id, input.value); }
      else if (e.key === 'Escape') { e.preventDefault(); blurHandled = true; mindmapEditingId = null; renderMindmap(); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        blurHandled = true;
        finishNodeEdit(node.id, input.value);
        setTimeout(() => addChildNode(), 30);
      }
      e.stopPropagation();
    });
    input.addEventListener('input', () => { input.style.width = Math.max(80, input.value.length * 9 + 20) + 'px'; });
    input.addEventListener('keypress', (e) => e.stopPropagation());
  } else {
    // ---- DISPLAY MODE ----
    if (node.image && !node.imageHidden) {
      const imgSize = MM_IMAGE_SIZES[node.imageSize || 'small'];
      labelEl.style.flexDirection = 'column';
      const imgEl = document.createElement('img');
      imgEl.className = 'mm-node-image';
      imgEl.src = `${API_BASE}/images/${node.image}`;
      imgEl.alt = node.text || 'Node image';
      imgEl.style.width = imgSize + 'px';
      imgEl.style.height = imgSize + 'px';
      imgEl.style.maxWidth = imgSize + 'px';
      imgEl.style.objectFit = 'contain';
      imgEl.style.display = 'block';
      imgEl.draggable = false;
      labelEl.appendChild(imgEl);
      if (node.text) {
        const textSpan = document.createElement('span');
        textSpan.className = 'mm-node-image-label';
        textSpan.textContent = node.text;
        labelEl.appendChild(textSpan);
      }
    } else {
      const textSpan = document.createElement('span');
      textSpan.textContent = node.text || (node.image ? '(image hidden)' : '(empty)');
      if (!node.text) textSpan.style.opacity = '0.4';
      labelEl.appendChild(textSpan);
    }

    // Readonly: lock icon
    if (readonly) {
      const lockIcon = document.createElement('span');
      lockIcon.className = 'mm-readonly-icon';
      lockIcon.title = 'Read-only — click to open linked mindmap';
      lockIcon.innerHTML = '<i class="fas fa-lock"></i>';
      labelEl.appendChild(lockIcon);
    }

    // VocabLink badge + Modify button on linked parent node
    if (!readonly && node.vocabLink) {
      const linkBadge = document.createElement('span');
      linkBadge.className = 'mm-linked-badge';
      linkBadge.title = 'Linked to another vocab\'s mindmap';
      linkBadge.innerHTML = '<i class="fas fa-link"></i>';
      labelEl.appendChild(linkBadge);

      const modifyBtn = document.createElement('button');
      modifyBtn.className = 'mm-modify-btn';
      modifyBtn.title = 'Open linked mindmap to modify';
      modifyBtn.innerHTML = '<i class="fas fa-external-link-alt"></i> Modify';
      modifyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearTimeout(mmClickTimer);
        const { vocabId, sectionId } = node.vocabLink;
        openMindmapByVocabId(vocabId, sectionId);
      });
      el.appendChild(modifyBtn);
    }

    el.appendChild(labelEl);

    // Collapse badge — uses dispChildren so linked subtrees count correctly
    const kids = dispChildren(node);
    if (kids.length > 0) {
      const collapseBtn = document.createElement('div');
      if (node.collapsed) {
        collapseBtn.className = 'mm-collapse-badge collapsed';
        collapseBtn.textContent = `▶ ${kids.length}`;
        collapseBtn.title = 'Click to expand';
      } else {
        collapseBtn.className = 'mm-collapse-badge expanded';
        collapseBtn.textContent = '▾';
        collapseBtn.title = 'Click to collapse';
      }
      if (!readonly) {
        collapseBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          clearTimeout(mmClickTimer);
          mindmapSelectedId = node.id;
          toggleCollapseNode(node.id);
        });
      }
      el.appendChild(collapseBtn);
    }

    // Description below
    if (node.desc) el.appendChild(buildDescEl(node.desc));

    if (readonly) {
      // Readonly: click navigates directly to the linked mindmap
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (mmIsPanning) return;
        clearTimeout(mmClickTimer);
        if (node._fromVocabLink) {
          const { vocabId, sectionId } = node._fromVocabLink;
          openMindmapByVocabId(vocabId, sectionId);
        }
      });
    } else {
      // Normal: click → select + side panel
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (mmIsPanning) return;
        clearTimeout(mmClickTimer);
        mmClickTimer = setTimeout(() => {
          mindmapSelectedId = node.id;
          mindmapEditingId = null;
          renderMindmap();
          openMindmapSidePanel(node.id);
        }, 200);
      });

      // Double-click → inline rename
      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        clearTimeout(mmClickTimer);
        mindmapSelectedId = node.id;
        mindmapEditingId = node.id;
        renderMindmap();
      });

      // Drag-to-reparent
      el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (node.id === 'root') return; // root cannot be dragged
        mmDragNodeId = node.id;
        mmDragStartPos = { x: e.clientX, y: e.clientY };
        e.stopPropagation(); // prevent canvas pan starting
      });

      // Hover → floating menu
      el.addEventListener('mouseenter', (e) => {
        clearTimeout(mmHoverTimeout);
        mmHoveredNodeId = node.id;
        mmHoverTimeout = setTimeout(() => showHoverMenu(node.id, el), 400);
      });
      el.addEventListener('mouseleave', () => {
        clearTimeout(mmHoverTimeout);
        mmHoverTimeout = setTimeout(() => hideHoverMenu(), 300);
      });
    }
  }

  container.appendChild(el);
  if (!node.collapsed) {
    const kids = dispChildren(node);
    const hasLinked = node._linkedChildren !== null && node._linkedChildren !== undefined;
    kids.forEach(child => renderNodes(child, positions, container, level + 1, hasLinked || readonly));
  }
}

// ===== HOVER MENU =====
function showHoverMenu(nodeId, nodeEl) {
  const menu = document.getElementById('mm-hover-menu');
  const rect = nodeEl.getBoundingClientRect();
  menu.style.left = (rect.left + rect.width / 2 - 50) + 'px';
  menu.style.top = (rect.top - 40) + 'px';
  menu.style.display = 'flex';
  menu.dataset.nodeId = nodeId;
}

function hideHoverMenu() {
  const menu = document.getElementById('mm-hover-menu');
  menu.style.display = 'none';
}

// ===== SIDE PANEL =====
function openMindmapSidePanel(nodeId) {
  if (!mindmapData) return;
  const node = findNode(mindmapData, nodeId);
  if (!node) return;

  mindmapSelectedId = nodeId;
  const panel = document.getElementById('mm-side-panel');
  document.getElementById('mm-side-title').textContent = nodeId === 'root' ? 'Root Node' : 'Node Details';
  document.getElementById('mm-side-name').value = node.text;
  document.getElementById('mm-side-desc').value = node.desc || '';

  // Image display in side panel
  const placeholder = document.getElementById('mm-side-image-placeholder');
  const preview = document.getElementById('mm-side-image-preview');
  const previewImg = document.getElementById('mm-side-image-img');
  const resizeBtns = document.getElementById('mm-image-resize-btns');

  if (node.image) {
    placeholder.style.display = 'none';
    preview.style.display = 'block';
    previewImg.src = `${API_BASE}/images/${node.image}`;
    resizeBtns.style.display = 'flex';
    // Set active size button (none active if hidden)
    document.querySelectorAll('.mm-resize-btn[data-size]').forEach(btn => {
      btn.classList.toggle('active', !node.imageHidden && btn.dataset.size === (node.imageSize || 'small'));
    });
    const hideBtn = document.getElementById('btn-mm-image-hide');
    if (hideBtn) hideBtn.classList.toggle('active', !!node.imageHidden);
  } else {
    placeholder.style.display = 'flex';
    preview.style.display = 'none';
    resizeBtns.style.display = 'none';
  }

  // Vocab link section
  updateSidePanelVocabSection(node);

  // All mindmaps list
  renderAllMindmapsList();

  panel.style.display = 'flex';
}

function closeMindmapSidePanel() {
  document.getElementById('mm-side-panel').style.display = 'none';
}

function saveSidePanelFields() {
  if (!mindmapData || !mindmapSelectedId) return;
  const node = findNode(mindmapData, mindmapSelectedId);
  if (!node) return;

  const newName = document.getElementById('mm-side-name').value.trim();
  const newDesc = document.getElementById('mm-side-desc').value.trim();
  if (newName) node.text = newName;
  node.desc = newDesc;
  saveMindmap();
  renderMindmap();
}

async function aiTranslateNode() {
  if (!mindmapData || !mindmapSelectedId) return;
  const node = findNode(mindmapData, mindmapSelectedId);
  if (!node) return;

  const btn = document.getElementById('btn-mm-ai-translate');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Translating...';

  try {
    const resp = await fetch(`${API_BASE}/api/mindmap-translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: node.text, fromLang: getBookConfig().fromLang, toLang: getBookConfig().toLang })
    });
    const data = await resp.json();
    if (data.result) {
      node.desc = data.result;
      document.getElementById('mm-side-desc').value = data.result;
      saveMindmap();
      renderMindmap();
    }
  } catch (err) {
    console.error('AI translate failed:', err);
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-robot"></i> AI Translate';
}

// ===== VOCAB / MINDMAP CROSS-LINKING =====

// Flatten the TOC tree into a flat array of { id, name }
function flattenAllSections(items, result = []) {
  (items || []).forEach(item => {
    result.push({ id: item.id, name: item.name });
    if (item.children) flattenAllSections(item.children, result);
  });
  return result;
}

// Find which section a vocab belongs to
function findVocabSectionId(vocabId) {
  for (const sectionId of Object.keys(appData.vocabs || {})) {
    const vocabs = appData.vocabs[sectionId] || [];
    if (vocabs.find(v => v.id === vocabId)) return sectionId;
  }
  return null;
}

// Get all mindmaps with their associated vocab word and sectionId
function getAllMindmapsData() {
  const result = [];
  const mindmaps = getMindmaps();
  Object.keys(mindmaps).forEach(vocabId => {
    const sectionId = findVocabSectionId(vocabId);
    if (!sectionId) return;
    const vocab = (appData.vocabs[sectionId] || []).find(v => v.id === vocabId);
    if (vocab) result.push({ vocabId, sectionId, word: vocab.word });
  });
  result.sort((a, b) => a.word.localeCompare(b.word));
  return result;
}

// Open a mindmap for any vocab (by vocabId + sectionId)
// If a mindmap is already open, the current one is pushed onto the history stack
function openMindmapByVocabId(vocabId, sectionId) {
  if (mindmapVocabId && mindmapVocabId !== vocabId) {
    mindmapHistory.push({ vocabId: mindmapVocabId, sectionId: currentVocabSectionId });
  }
  currentVocabId = vocabId;
  currentVocabSectionId = sectionId;
  openMindmap(false);
}

// Create a vocab (and sentence) from the currently selected node
function createVocabFromNode() {
  if (!mindmapData || !mindmapSelectedId) return;
  const node = findNode(mindmapData, mindmapSelectedId);
  if (!node) return;

  const word = node.text.trim();
  if (!word) { alert('Node has no text to create a vocab from.'); return; }

  // Determine target sectionId: same as the current mindmap's vocab, fallback to currentSectionId
  const mmSectionId = findVocabSectionId(mindmapVocabId);
  const targetSection = mmSectionId || currentVocabSectionId || currentSectionId;
  if (!targetSection) { alert('No section found to add the vocab to.'); return; }

  // Create sentence
  if (!appData.sentences[targetSection]) appData.sentences[targetSection] = [];
  const sentenceId = uid();
  appData.sentences[targetSection].push({ id: sentenceId, text: word });

  // Create vocab directly
  if (!appData.vocabs[targetSection]) appData.vocabs[targetSection] = [];
  const existing = appData.vocabs[targetSection].find(
    v => v.word.toLowerCase() === word.toLowerCase()
  );
  let newVocabId;
  if (existing) {
    newVocabId = existing.id;
    if (node.desc) {
      if (!existing.definitions) existing.definitions = [];
      existing.definitions.push({ pos: '', vietnamese: node.desc, english: '', example: '' });
    }
  } else {
    newVocabId = uid();
    const definitions = node.desc ? [{ pos: '', vietnamese: node.desc, english: '', example: '' }] : [];
    appData.vocabs[targetSection].push({
      id: newVocabId,
      word: word,
      pronunciation: '',
      definitions,
      aiBrief: '',
      notes: '',
      sentenceId
    });
  }

  // Link node to the new/existing vocab
  node.vocabLink = { vocabId: newVocabId, sectionId: targetSection };
  saveMindmap();
  saveData();

  // Update side panel to reflect the new link
  updateSidePanelVocabSection(node);
}

// Extract the selected node's entire subtree into a new vocab + mindmap.
// The node stays in the parent mindmap as a linked placeholder (vocabLink).
function extractNodeToVocab() {
  if (!mindmapData || !mindmapSelectedId) return;
  if (mindmapSelectedId === 'root') { alert('Cannot extract the root node.'); return; }

  const node = findNode(mindmapData, mindmapSelectedId);
  if (!node) return;

  const word = node.text.trim();
  if (!word) { alert('Node has no text. Please name it first.'); return; }

  const hasChildren = node.children && node.children.length > 0;
  if (!hasChildren && !node.vocabLink) {
    if (!confirm(`"${word}" has no children. Extract it to a new vocab anyway?`)) return;
  }

  if (node.vocabLink) {
    // Already linked — offer to open it instead
    if (confirm(`"${word}" is already linked to a vocab mindmap.\nClick OK to open that mindmap, or Cancel to stay here.`)) {
      const { vocabId, sectionId } = node.vocabLink;
      openMindmapByVocabId(vocabId, sectionId);
    }
    return;
  }

  // Determine section
  const mmSectionId = findVocabSectionId(mindmapVocabId);
  const targetSection = mmSectionId || currentVocabSectionId || currentSectionId;
  if (!targetSection) { alert('No section found to create the vocab in.'); return; }

  // Create the vocab entry
  if (!appData.vocabs[targetSection]) appData.vocabs[targetSection] = [];
  const newVocabId = uid();
  const definitions = node.desc ? [{ pos: '', vietnamese: node.desc, english: '', example: '' }] : [];
  appData.vocabs[targetSection].push({
    id: newVocabId,
    word,
    pronunciation: '',
    definitions,
    aiBrief: '',
    notes: '',
    sentenceId: null
  });

  // Build the new mindmap: root is the node, children are node's current children
  const newMindmapRoot = {
    id: 'root',
    text: word,
    desc: node.desc || '',
    collapsed: false,
    image: node.image || '',
    imageSize: node.imageSize || 'small',
    imageHidden: !!node.imageHidden,
    vocabLink: null,
    children: JSON.parse(JSON.stringify(node.children || []))
  };
  getMindmaps()[newVocabId] = cleanMindmapForSave(newMindmapRoot);

  // Replace node's children with the link; keep the node itself in the parent mindmap
  node.children = [];
  node.vocabLink = { vocabId: newVocabId, sectionId: targetSection };

  saveMindmap();
  saveData();
  updateTabCounts();
  renderMindmap();
  updateSidePanelVocabSection(node);

  // Notify user
  const sections = flattenAllSections(appData.toc);
  const sectionName = (sections.find(s => s.id === targetSection) || {}).name || '';
  alert(`"${word}" has been extracted to a new vocab${sectionName ? ` in "${sectionName}"` : ''}.\nIts subtree is now its own mindmap.\nClick the 🔗 badge or "Modify" to edit it.`);
}

// Update the vocab section of the side panel for a given node
function updateSidePanelVocabSection(node) {
  if (!node) return;
  const statusEl = document.getElementById('mm-side-vocab-status');
  const createBtn = document.getElementById('btn-mm-create-vocab');
  const openBtn = document.getElementById('btn-mm-open-linked-mindmap');
  const extractBtn = document.getElementById('btn-mm-extract-to-vocab');
  if (!statusEl) return;

  const hasChildren = node.children && node.children.length > 0;

  if (node.vocabLink) {
    const { vocabId, sectionId } = node.vocabLink;
    const sections = flattenAllSections(appData.toc);
    const section = sections.find(s => s.id === sectionId);
    const vocab = (appData.vocabs[sectionId] || []).find(v => v.id === vocabId);
    if (vocab) {
      const sectionLabel = section ? ` <span class="mm-vocab-section-name">(${escapeHtml(section.name)})</span>` : '';
      statusEl.innerHTML = `<span class="mm-vocab-link-badge"><i class="fas fa-link"></i> <strong>${escapeHtml(vocab.word)}</strong>${sectionLabel}</span>`;
      createBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Re-link Vocab';
    } else {
      statusEl.innerHTML = '<span class="mm-vocab-link-missing"><i class="fas fa-exclamation-triangle"></i> Linked vocab not found</span>';
      createBtn.innerHTML = '<i class="fas fa-plus"></i> Create Vocab from Node';
      node.vocabLink = null;
    }
    openBtn.style.display = '';
    if (extractBtn) extractBtn.style.display = 'none'; // already extracted
  } else {
    statusEl.innerHTML = '';
    createBtn.innerHTML = '<i class="fas fa-plus"></i> Create Vocab from Node';
    openBtn.style.display = 'none';
    // Show extract button only when there are children to extract
    if (extractBtn) extractBtn.style.display = (hasChildren && node.id !== 'root') ? '' : 'none';
  }
}

// Render all mindmaps list into the mindmap side panel
function renderAllMindmapsList() {
  const allMaps = getAllMindmapsData();
  const listEl = document.getElementById('mm-all-mindmaps-list');
  const countEl = document.getElementById('mm-maps-count');
  if (!listEl) return;

  countEl.textContent = allMaps.length ? `(${allMaps.length})` : '';
  if (allMaps.length === 0) {
    listEl.innerHTML = '<span class="mm-maps-empty">No mindmaps yet</span>';
    return;
  }

  listEl.innerHTML = '';
  allMaps.forEach(({ vocabId, sectionId, word }) => {
    const isCurrent = vocabId === mindmapVocabId;
    const item = document.createElement('div');
    item.className = 'mm-map-item' + (isCurrent ? ' current' : '');
    item.innerHTML = `<i class="fas fa-project-diagram"></i> ${escapeHtml(word)}`;
    if (isCurrent) item.innerHTML += ' <span class="mm-map-current-badge">current</span>';
    if (!isCurrent) {
      item.addEventListener('click', () => openMindmapByVocabId(vocabId, sectionId));
    }
    listEl.appendChild(item);
  });
}

// Find all mindmaps that contain a node linking to the given vocabId
function findMindmapsReferencingVocab(targetVocabId) {
  const result = [];
  const mindmaps = getMindmaps();

  function searchNode(node) {
    if (node.vocabLink && node.vocabLink.vocabId === targetVocabId) return true;
    if (node.children) {
      for (const child of node.children) {
        if (searchNode(child)) return true;
      }
    }
    return false;
  }

  Object.keys(mindmaps).forEach(ownerVocabId => {
    if (ownerVocabId === targetVocabId) return;
    const root = mindmaps[ownerVocabId];
    if (!root || !searchNode(root)) return;
    const sid = findVocabSectionId(ownerVocabId);
    if (!sid) return;
    const vocab = (appData.vocabs[sid] || []).find(v => v.id === ownerVocabId);
    if (vocab) result.push({ vocabId: ownerVocabId, sectionId: sid, word: vocab.word });
  });

  result.sort((a, b) => a.word.localeCompare(b.word));
  return result;
}

// Render all mindmaps list into the vocab panel (sentence/word side panel)
function renderVocabPanelMindmapsList() {
  if (!currentVocabId) return;

  // --- Own mindmap ---
  const ownEl = document.getElementById('vocab-panel-own-mindmap');
  if (ownEl) {
    const mindmaps = getMindmaps();
    const hasMindmap = !!mindmaps[currentVocabId];
    ownEl.innerHTML = '';
    if (hasMindmap) {
      const sid = currentVocabSectionId || findVocabSectionId(currentVocabId);
      const item = document.createElement('div');
      item.className = 'mm-map-item';
      item.innerHTML = '<i class="fas fa-project-diagram"></i> Open mindmap';
      item.addEventListener('click', () => openMindmapByVocabId(currentVocabId, sid));
      ownEl.appendChild(item);
    } else {
      ownEl.innerHTML = '<span class="mm-maps-empty">No mindmap yet</span>';
    }
  }

  // --- Referencing mindmaps ---
  const refEl = document.getElementById('vocab-panel-referencing-mindmaps');
  if (refEl) {
    const refs = findMindmapsReferencingVocab(currentVocabId);
    refEl.innerHTML = '';
    if (refs.length === 0) {
      refEl.innerHTML = '<span class="mm-maps-empty">Not referenced by any mindmap</span>';
    } else {
      refs.forEach(({ vocabId, sectionId, word }) => {
        const item = document.createElement('div');
        item.className = 'mm-map-item';
        item.innerHTML = `<i class="fas fa-project-diagram"></i> ${escapeHtml(word)}`;
        item.addEventListener('click', () => openMindmapByVocabId(vocabId, sectionId));
        refEl.appendChild(item);
      });
    }
  }
}

// ===== NODE EDITING =====
function finishNodeEdit(nodeId, newText) {
  if (!mindmapData) return;
  const node = findNode(mindmapData, nodeId);
  if (node) node.text = newText.trim() || node.text;
  mindmapEditingId = null;
  saveMindmap();
  renderMindmap();
  // Update side panel if open for this node
  if (mindmapSelectedId === nodeId) {
    document.getElementById('mm-side-name').value = node ? node.text : '';
  }
}

function addChildNode() {
  if (!mindmapData || !mindmapSelectedId) return;
  const parent = findNode(mindmapData, mindmapSelectedId);
  if (!parent) return;
  if (parent.vocabLink) {
    if (confirm(`"${parent.text}" is linked to another vocab's mindmap.\nClick OK to open that mindmap and add children there.`)) {
      openMindmapByVocabId(parent.vocabLink.vocabId, parent.vocabLink.sectionId);
    }
    return;
  }
  const child = createMindmapNode('', parent.id);
  if (!parent.children) parent.children = [];
  parent.children.push(child);
  mindmapSelectedId = child.id;
  mindmapEditingId = child.id;
  saveMindmap();
  renderMindmap();
  openMindmapSidePanel(child.id);
}

function addSiblingNode() {
  if (!mindmapData || !mindmapSelectedId) return;
  if (mindmapSelectedId === 'root') { addChildNode(); return; }
  const parent = findParentNode(mindmapData, mindmapSelectedId);
  if (!parent) return;
  const sibling = createMindmapNode('', parent.id);
  const idx = parent.children.findIndex(c => c.id === mindmapSelectedId);
  parent.children.splice(idx + 1, 0, sibling);
  mindmapSelectedId = sibling.id;
  mindmapEditingId = sibling.id;
  saveMindmap();
  renderMindmap();
  openMindmapSidePanel(sibling.id);
}

function deleteSelectedNode() {
  if (!mindmapData || !mindmapSelectedId) return;
  if (mindmapSelectedId === 'root') {
    if (confirm('Delete entire mindmap?')) {
      const mindmaps = getMindmaps();
      delete mindmaps[mindmapVocabId];
      saveData();
      closeMindmap();
    }
    return;
  }
  const parent = findParentNode(mindmapData, mindmapSelectedId);
  if (!parent) return;
  const idx = parent.children.findIndex(c => c.id === mindmapSelectedId);
  if (idx !== -1) {
    parent.children.splice(idx, 1);
    mindmapSelectedId = parent.id;
    mindmapEditingId = null;
    saveMindmap();
    renderMindmap();
    openMindmapSidePanel(parent.id);
  }
}

function moveNodeUp() {
  if (!mindmapData || !mindmapSelectedId || mindmapSelectedId === 'root') return;
  const parent = findParentNode(mindmapData, mindmapSelectedId);
  if (!parent) return;
  const idx = parent.children.findIndex(c => c.id === mindmapSelectedId);
  if (idx <= 0) return;
  // Swap with previous
  [parent.children[idx - 1], parent.children[idx]] = [parent.children[idx], parent.children[idx - 1]];
  saveMindmap();
  renderMindmap();
}

function moveNodeDown() {
  if (!mindmapData || !mindmapSelectedId || mindmapSelectedId === 'root') return;
  const parent = findParentNode(mindmapData, mindmapSelectedId);
  if (!parent) return;
  const idx = parent.children.findIndex(c => c.id === mindmapSelectedId);
  if (idx === -1 || idx >= parent.children.length - 1) return;
  // Swap with next
  [parent.children[idx], parent.children[idx + 1]] = [parent.children[idx + 1], parent.children[idx]];
  saveMindmap();
  renderMindmap();
}

function toggleCollapseNode(nodeId) {
  if (!mindmapData) return;
  const id = nodeId || mindmapSelectedId;
  if (!id) return;
  const node = findNode(mindmapData, id);
  if (!node || !node.children || node.children.length === 0) return;
  node.collapsed = !node.collapsed;
  saveMindmap();
  renderMindmap();
  // Update toolbar icon
  updateCollapseBtn(node);
}

function reverseChildNodes(nodeId) {
  if (!mindmapData) return;
  const id = nodeId || mindmapSelectedId;
  if (!id) return;
  const node = findNode(mindmapData, id);
  if (!node || !node.children || node.children.length < 2) return;
  node.children.reverse();
  saveMindmap();
  renderMindmap();
}

function updateCollapseBtn(node) {
  const btn = document.getElementById('btn-mindmap-collapse');
  if (!btn) return;
  if (node && node.collapsed) {
    btn.title = 'Expand children (C)';
    btn.innerHTML = '<i class="fas fa-expand-alt"></i>';
  } else {
    btn.title = 'Collapse children (C)';
    btn.innerHTML = '<i class="fas fa-compress-alt"></i>';
  }
}

function clearMindmapSvg() {
  const svg = document.getElementById('mindmap-svg');
  if (svg) svg.innerHTML = '';
}

function navigateMindmap(direction) {
  if (!mindmapData || !mindmapSelectedId) return;
  if (direction === 'down' || direction === 'up') {
    if (mindmapSelectedId === 'root') {
      if (direction === 'down' && mindmapData.children && mindmapData.children.length > 0)
        mindmapSelectedId = mindmapData.children[0].id;
    } else {
      const parent = findParentNode(mindmapData, mindmapSelectedId);
      if (parent) {
        const idx = parent.children.findIndex(c => c.id === mindmapSelectedId);
        if (direction === 'down' && idx < parent.children.length - 1)
          mindmapSelectedId = parent.children[idx + 1].id;
        else if (direction === 'up' && idx > 0)
          mindmapSelectedId = parent.children[idx - 1].id;
      }
    }
  } else if (direction === 'right') {
    const node = findNode(mindmapData, mindmapSelectedId);
    if (node && node.children && node.children.length > 0)
      mindmapSelectedId = node.children[0].id;
  } else if (direction === 'left') {
    if (mindmapSelectedId !== 'root') {
      const parent = findParentNode(mindmapData, mindmapSelectedId);
      if (parent) mindmapSelectedId = parent.id;
    }
  }
  mindmapEditingId = null;
  renderMindmap();
  openMindmapSidePanel(mindmapSelectedId);
}

// ===== IMAGE PASTE & UPLOAD =====
async function pasteImageFromClipboard() {
  if (!mindmapData || !mindmapSelectedId) return;

  try {
    const clipboardItems = await navigator.clipboard.read();
    for (const clipItem of clipboardItems) {
      for (const type of clipItem.types) {
        if (type.startsWith('image/')) {
          const blob = await clipItem.getType(type);
          await uploadMindmapImage(blob);
          return;
        }
      }
    }
    alert('No image found in clipboard. Copy an image first then click the button.');
  } catch (err) {
    console.error('Clipboard read failed:', err);
    alert('Could not read clipboard. Make sure you have copied an image and allowed clipboard access.');
  }
}

async function uploadMindmapImage(blob) {
  if (!mindmapData || !mindmapSelectedId || !mindmapVocabId) return;

  const formData = new FormData();
  formData.append('image', blob);
  formData.append('nodeId', mindmapSelectedId);
  formData.append('vocabId', mindmapVocabId);

  try {
    const resp = await fetch(`${API_BASE}/api/images/upload`, {
      method: 'POST',
      body: formData
    });
    const data = await resp.json();
    if (data.success && data.filename) {
      const node = findNode(mindmapData, mindmapSelectedId);
      if (node) {
        node.image = data.filename;
        if (!node.imageSize) node.imageSize = 'small';
        saveMindmap();
        renderMindmap();
        openMindmapSidePanel(mindmapSelectedId);
      }
    }
  } catch (err) {
    console.error('Image upload failed:', err);
  }
}

async function deleteMindmapImage() {
  if (!mindmapData || !mindmapSelectedId) return;
  const node = findNode(mindmapData, mindmapSelectedId);
  if (!node || !node.image) return;

  if (!confirm('Delete this image?')) return;

  try {
    await fetch(`${API_BASE}/api/images/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: node.image })
    });
  } catch (err) {
    console.error('Image delete request failed:', err);
  }

  node.image = '';
  saveMindmap();
  renderMindmap();
  openMindmapSidePanel(mindmapSelectedId);
}

function setMindmapImageSize(size) {
  if (!mindmapData || !mindmapSelectedId) return;
  const node = findNode(mindmapData, mindmapSelectedId);
  if (!node) return;
  node.imageSize = size;
  node.imageHidden = false;
  saveMindmap();
  renderMindmap();
  // Update resize button state
  document.querySelectorAll('.mm-resize-btn[data-size]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.size === size);
  });
  const hideBtn = document.getElementById('btn-mm-image-hide');
  if (hideBtn) hideBtn.classList.remove('active');
}

function toggleHideNodeImage() {
  if (!mindmapData || !mindmapSelectedId) return;
  const node = findNode(mindmapData, mindmapSelectedId);
  if (!node || !node.image) return;
  node.imageHidden = !node.imageHidden;
  saveMindmap();
  renderMindmap();
  // Update button states
  document.querySelectorAll('.mm-resize-btn[data-size]').forEach(btn => {
    btn.classList.toggle('active', !node.imageHidden && btn.dataset.size === node.imageSize);
  });
  const hideBtn = document.getElementById('btn-mm-image-hide');
  if (hideBtn) hideBtn.classList.toggle('active', !!node.imageHidden);
}

// ===== INIT MINDMAP EVENTS =====
function initMindmapEvents() {
  // Close
  document.getElementById('btn-mindmap-close').addEventListener('click', closeMindmap);
  document.getElementById('btn-mm-back').addEventListener('click', goBackMindmap);

  // Toolbar
  document.getElementById('btn-mindmap-add-child').addEventListener('click', addChildNode);
  document.getElementById('btn-mindmap-add-sibling').addEventListener('click', addSiblingNode);
  document.getElementById('btn-mindmap-move-up').addEventListener('click', moveNodeUp);
  document.getElementById('btn-mindmap-move-down').addEventListener('click', moveNodeDown);
  document.getElementById('btn-mindmap-collapse').addEventListener('click', () => toggleCollapseNode());
  document.getElementById('btn-mindmap-reverse').addEventListener('click', () => reverseChildNodes());
  document.getElementById('btn-mindmap-delete-node').addEventListener('click', deleteSelectedNode);

  // Open from vocab panel
  document.getElementById('btn-vocab-mindmap').addEventListener('click', openMindmap);

  // Layout switcher
  document.querySelectorAll('.mm-layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      mindmapLayout = btn.dataset.layout;
      document.querySelectorAll('.mm-layout-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (mindmapVocabId) setMindmapLayout(mindmapVocabId, mindmapLayout);
      resetMindmapPan();
      renderMindmap();
    });
  });

  // Side panel
  document.getElementById('btn-mm-side-close').addEventListener('click', closeMindmapSidePanel);
  document.getElementById('btn-mm-side-save').addEventListener('click', saveSidePanelFields);
  document.getElementById('btn-mm-ai-translate').addEventListener('click', aiTranslateNode);

  // Image paste button
  document.getElementById('btn-mm-paste-image').addEventListener('click', pasteImageFromClipboard);
  document.getElementById('btn-mm-paste-image-replace').addEventListener('click', pasteImageFromClipboard);

  // Image delete button
  document.getElementById('btn-mm-image-delete').addEventListener('click', deleteMindmapImage);

  // Vocab / mindmap cross-link buttons
  document.getElementById('btn-mm-create-vocab').addEventListener('click', createVocabFromNode);
  document.getElementById('btn-mm-open-linked-mindmap').addEventListener('click', () => {
    if (!mindmapData || !mindmapSelectedId) return;
    const node = findNode(mindmapData, mindmapSelectedId);
    if (!node || !node.vocabLink) return;
    openMindmapByVocabId(node.vocabLink.vocabId, node.vocabLink.sectionId);
  });
  document.getElementById('btn-mm-extract-to-vocab').addEventListener('click', extractNodeToVocab);

  // Image resize buttons
  document.querySelectorAll('.mm-resize-btn[data-size]').forEach(btn => {
    btn.addEventListener('click', () => setMindmapImageSize(btn.dataset.size));
  });
  document.getElementById('btn-mm-image-hide').addEventListener('click', toggleHideNodeImage);

  // --- Canvas panning with left mouse ---
  const canvas = document.getElementById('mindmap-canvas');

  canvas.addEventListener('mousedown', (e) => {
    // Only pan when clicking on background (not on nodes)
    if (e.target.closest('.mm-node')) return;
    if (e.button !== 0) return;
    mmIsPanning = true;
    mmPanStart = { x: e.clientX, y: e.clientY, px: mindmapPanX, py: mindmapPanY };
    canvas.classList.add('panning');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    // --- Canvas panning ---
    if (mmIsPanning) {
      mindmapPanX = mmPanStart.px + (e.clientX - mmPanStart.x);
      mindmapPanY = mmPanStart.py + (e.clientY - mmPanStart.y);
      applyPanTransform();
      return;
    }

    // --- Node drag ---
    if (!mmDragNodeId) return;
    const dx = e.clientX - mmDragStartPos.x;
    const dy = e.clientY - mmDragStartPos.y;
    if (!mmIsDragging) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      // Threshold crossed — start drag
      mmIsDragging = true;
      clearTimeout(mmHoverTimeout);
      hideHoverMenu();
      // Mark source node
      const sourceEl = document.querySelector(`.mm-node[data-node-id="${mmDragNodeId}"]`);
      if (sourceEl) sourceEl.classList.add('mm-node-drag-source');
      // Create ghost
      const txt = (mindmapData && findNode(mindmapData, mmDragNodeId));
      mmDragGhost = document.createElement('div');
      mmDragGhost.className = 'mm-drag-ghost';
      mmDragGhost.textContent = txt ? (txt.text || '(empty)') : '';
      mmDragGhost.style.pointerEvents = 'none';
      document.body.appendChild(mmDragGhost);
    }

    // Move ghost
    if (mmDragGhost) {
      mmDragGhost.style.left = (e.clientX + 14) + 'px';
      mmDragGhost.style.top = (e.clientY + 6) + 'px';
    }

    // Detect drop target via elementFromPoint (ghost has pointerEvents:none)
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const targetNode = target ? target.closest('.mm-node') : null;
    const hoverId = targetNode ? targetNode.dataset.nodeId : null;

    // Update drag-over highlights
    document.querySelectorAll('.mm-node-drag-over').forEach(el => el.classList.remove('mm-node-drag-over'));
    if (hoverId && hoverId !== mmDragNodeId && mindmapData) {
      const dragNodeObj = findNode(mindmapData, mmDragNodeId);
      const dropNodeObj = findNode(mindmapData, hoverId);
      const valid = dragNodeObj && dropNodeObj
        && !dropNodeObj._readonly
        && !dropNodeObj.vocabLink
        && !isDescendant(dragNodeObj, hoverId);
      if (valid) {
        targetNode.classList.add('mm-node-drag-over');
        mmDragOverNodeId = hoverId;
      } else {
        mmDragOverNodeId = null;
      }
    } else {
      mmDragOverNodeId = null;
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (mmIsPanning) {
      setTimeout(() => { mmIsPanning = false; }, 50);
      canvas.classList.remove('panning');
    }
    if (mmIsDragging) {
      executeMindmapDrop();
      mmIsDragging = false;
      mmDragNodeId = null;
      mmDragOverNodeId = null;
    } else {
      // mousedown was set but threshold not crossed — clear cleanly
      mmDragNodeId = null;
    }
  });

  // Canvas click to deselect
  canvas.addEventListener('click', (e) => {
    if (e.target.closest('.mm-node')) return;
    if (mmIsPanning) return;
    mindmapSelectedId = null;
    mindmapEditingId = null;
    renderMindmap();
    closeMindmapSidePanel();
  });

  // Mouse wheel zoom
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(3, Math.max(0.2, mindmapZoom * delta));
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    mindmapPanX = cx - (cx - mindmapPanX) * (newZoom / mindmapZoom);
    mindmapPanY = cy - (cy - mindmapPanY) * (newZoom / mindmapZoom);
    mindmapZoom = newZoom;
    applyPanTransform();
  }, { passive: false });

  // Close overlay on backdrop — REMOVED (use X button only)

  // Hover menu interactions
  const hoverMenu = document.getElementById('mm-hover-menu');
  hoverMenu.addEventListener('mouseenter', () => clearTimeout(mmHoverTimeout));
  hoverMenu.addEventListener('mouseleave', () => { mmHoverTimeout = setTimeout(() => hideHoverMenu(), 200); });

  hoverMenu.querySelectorAll('.mm-hover-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const nodeId = hoverMenu.dataset.nodeId;
      hideHoverMenu();
      if (!nodeId || !mindmapData) return;

      if (action === 'rename') {
        mindmapSelectedId = nodeId;
        mindmapEditingId = nodeId;
        renderMindmap();
      } else if (action === 'add-desc') {
        mindmapSelectedId = nodeId;
        renderMindmap();
        openMindmapSidePanel(nodeId);
        // Focus description textarea
        setTimeout(() => document.getElementById('mm-side-desc').focus(), 100);
      } else if (action === 'ai-desc') {
        mindmapSelectedId = nodeId;
        renderMindmap();
        openMindmapSidePanel(nodeId);
        setTimeout(() => aiTranslateNode(), 100);
      } else if (action === 'collapse') {
        mindmapSelectedId = nodeId;
        toggleCollapseNode(nodeId);
      } else if (action === 'reverse') {
        mindmapSelectedId = nodeId;
        reverseChildNodes(nodeId);
      } else if (action === 'extract') {
        mindmapSelectedId = nodeId;
        extractNodeToVocab();
      }
    });
  });

  // Keyboard shortcuts for mindmap
  document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('mindmap-overlay');
    if (overlay.style.display === 'none' || !overlay.style.display) return;
    if (mindmapEditingId) return;
    // Don't capture when typing in side panel inputs
    if (e.target.closest('.mm-side-panel')) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      // If side panel open, close it first
      if (document.getElementById('mm-side-panel').style.display !== 'none') {
        closeMindmapSidePanel();
        return;
      }
      closeMindmap();
      return;
    }

    if (!mindmapData) return;

    switch (e.key) {
      case 'Tab':
        e.preventDefault(); addChildNode(); break;
      case ' ':
        e.preventDefault(); addSiblingNode(); break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault(); deleteSelectedNode(); break;
      case 'F2':
        e.preventDefault();
        if (mindmapSelectedId) { mindmapEditingId = mindmapSelectedId; renderMindmap(); }
        break;
      case 'Enter':
        e.preventDefault();
        if (mindmapSelectedId) { mindmapEditingId = mindmapSelectedId; renderMindmap(); }
        break;
      case 'ArrowUp':    e.preventDefault(); navigateMindmap('up'); break;
      case 'ArrowDown':  e.preventDefault(); navigateMindmap('down'); break;
      case 'ArrowRight': e.preventDefault(); navigateMindmap('right'); break;
      case 'ArrowLeft':  e.preventDefault(); navigateMindmap('left'); break;
      case 'c':
      case 'C':
        e.preventDefault(); toggleCollapseNode(); break;
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
