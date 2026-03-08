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

