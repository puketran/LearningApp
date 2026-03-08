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

