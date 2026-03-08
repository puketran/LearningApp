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

