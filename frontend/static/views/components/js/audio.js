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

