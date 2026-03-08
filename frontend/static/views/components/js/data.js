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

