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

