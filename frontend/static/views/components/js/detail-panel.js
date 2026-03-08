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

