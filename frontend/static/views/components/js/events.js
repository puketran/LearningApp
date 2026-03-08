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
  // Always require user selection on every page load
  if (typeof getCurrentUserId === 'function' && !getCurrentUserId()) {
    showUserSelectScreen();
    return;
  }

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

