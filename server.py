"""
English Reading & Learning - Python Backend
Serves static files and provides Azure OpenAI API endpoint.
"""

import os
import json
import glob
import re
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from openai import AzureOpenAI
import azure.cognitiveservices.speech as speechsdk

load_dotenv()

app = Flask(__name__, static_folder=".", static_url_path="")
CORS(app)

# ===== Books folder =====
BOOKS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "books")
os.makedirs(BOOKS_DIR, exist_ok=True)

# ===== Audios folder =====
AUDIOS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audios")
os.makedirs(AUDIOS_DIR, exist_ok=True)

# ===== Recordings folder =====
RECORDINGS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "recordings")
os.makedirs(RECORDINGS_DIR, exist_ok=True)

# ===== Images folder (for mindmap node images) =====
IMAGES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")
os.makedirs(IMAGES_DIR, exist_ok=True)

# ===== Azure Speech Config =====
speech_key = os.getenv("AZURE_SPEECH_KEY")
speech_region = os.getenv("AZURE_SPEECH_REGION")

# ===== Azure OpenAI Config =====
endpoint = os.getenv("ENDPOINT_URL")
deployment = os.getenv("DEPLOYMENT_NAME")
api_key = os.getenv("AZURE_OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY")
api_version = os.getenv("API_VERSION", "2024-02-01")

client = AzureOpenAI(
    api_key=api_key,
    api_version=api_version,
    azure_endpoint=endpoint,
)


def ask_ai(prompt: str, json_mode: bool = False, from_lang: str = "English", to_lang: str = "Vietnamese") -> str:
    """Send a prompt to Azure OpenAI and return the response text."""
    system_content = (
        f"You are a helpful {from_lang}-{to_lang} language tutor. "
        f"The user is studying {from_lang} and wants explanations and translations in {to_lang}. "
        "When a sentence context is provided, tailor the meanings to that specific usage."
    )
    if json_mode:
        system_content += (
            "\nYou MUST respond with valid JSON only, no markdown, no extra text. "
            "The JSON must have these exact keys: "
            '"pronunciation", "vietnamese_meaning", "english_meaning", "examples" (array of 3 strings).'
        )

    kwargs = dict(
        model=deployment,
        messages=[
            {"role": "system", "content": system_content},
            {"role": "user", "content": prompt},
        ],
        temperature=1,
        max_completion_tokens=1000,
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    response = client.chat.completions.create(**kwargs)
    return response.choices[0].message.content


# ===== API Routes =====


@app.route("/api/explain", methods=["POST"])
def explain_word():
    """Explain a word or phrase using Azure OpenAI. Returns structured JSON."""
    data = request.get_json()
    word = data.get("word", "").strip()
    context_sentence = data.get("sentence", "").strip()
    from_lang = data.get("fromLang", "English").strip() or "English"
    to_lang = data.get("toLang", "Vietnamese").strip() or "Vietnamese"

    if not word:
        return jsonify({"error": "No word provided"}), 400

    prompt = f'Explain the {from_lang} word/phrase "{word}".'
    if context_sentence:
        prompt += f'\nIt appears in this sentence: "{context_sentence}"'
        prompt += f'\nBase the {to_lang} and English meanings on how it is used in that sentence.'
    prompt += (
        f'\nRespond with JSON containing these keys:\n'
        f'- "pronunciation": IPA transcription of the word\n'
        f'- "vietnamese_meaning": {to_lang} translation fitting the context\n'
        f'- "english_meaning": English definition fitting the context\n'
        f'- "examples": array of exactly 3 example sentences using this word/phrase'
    )

    try:
        raw = ask_ai(prompt, json_mode=True, from_lang=from_lang, to_lang=to_lang)
        parsed = json.loads(raw)
        return jsonify({"result": parsed})
    except json.JSONDecodeError:
        return jsonify({"result": raw})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/translate", methods=["POST"])
def translate_word():
    """Translate a word/phrase to the target language."""
    data = request.get_json()
    word = data.get("word", "").strip()
    target_lang = data.get("targetLang", "Vietnamese") or "Vietnamese"
    from_lang = data.get("fromLang", "English").strip() or "English"

    if not word:
        return jsonify({"error": "No word provided"}), 400

    prompt = (
        f'Translate the {from_lang} word/phrase "{word}" to {target_lang}. '
        f"Provide the translation and a brief explanation of usage."
    )

    try:
        result = ask_ai(prompt, from_lang=from_lang, to_lang=target_lang)
        return jsonify({"result": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/translate-sentence", methods=["POST"])
def translate_sentence():
    """Translate a full sentence using Azure OpenAI."""
    data = request.get_json()
    sentence = data.get("sentence", "").strip()
    from_lang = data.get("fromLang", "English").strip() or "English"
    to_lang = data.get("toLang", "Vietnamese").strip() or "Vietnamese"

    if not sentence:
        return jsonify({"error": "No sentence provided"}), 400

    prompt = (
        f'Translate this {from_lang} sentence to {to_lang}:\n"{sentence}"\n\n'
        f'Respond with JSON containing these keys:\n'
        f'- "translation": the {to_lang} translation\n'
        f'- "notes": brief grammar or usage notes (1-2 sentences, in English)'
    )

    try:
        raw = ask_ai(prompt, json_mode=True, from_lang=from_lang, to_lang=to_lang)
        parsed = json.loads(raw)
        return jsonify({"result": parsed})
    except json.JSONDecodeError:
        return jsonify({"result": {"translation": raw, "notes": ""}})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/ask", methods=["POST"])
def ask_general():
    """General AI question about English learning."""
    data = request.get_json()
    question = data.get("question", "").strip()

    if not question:
        return jsonify({"error": "No question provided"}), 400

    try:
        result = ask_ai(question)
        return jsonify({"result": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/mindmap-translate", methods=["POST"])
def mindmap_translate():
    """Translate or describe a word/phrase for mindmap nodes."""
    data = request.get_json()
    word = data.get("word", "").strip()
    from_lang = data.get("fromLang", "English").strip() or "English"
    to_lang = data.get("toLang", "Vietnamese").strip() or "Vietnamese"

    if not word:
        return jsonify({"error": "No word provided"}), 400

    prompt = (
        f'Translate or briefly describe the {from_lang} word/phrase "{word}" in {to_lang}. '
        f'Provide only the {to_lang} translation or a very short description (max 8 words). '
        f'No extra explanation, just the {to_lang} text.'
    )

    try:
        result = ask_ai(prompt, from_lang=from_lang, to_lang=to_lang)
        result = result.strip().strip('"').strip("'")
        return jsonify({"result": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ===== Book Save/Load Routes =====


@app.route("/api/books", methods=["GET"])
def list_books():
    """List all saved books in the books folder."""
    books = []
    for filepath in glob.glob(os.path.join(BOOKS_DIR, "*.json")):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            name = data.get("name", os.path.basename(filepath).replace(".json", ""))
            books.append({
                "filename": os.path.basename(filepath),
                "name": name,
                "chapters": len(data.get("toc", [])),
            })
        except Exception:
            continue
    return jsonify({"books": books})


@app.route("/api/books/save", methods=["POST"])
def save_book():
    """Save a book to the books folder."""
    data = request.get_json()
    name = data.get("name", "Untitled").strip()
    if not name:
        return jsonify({"error": "No name provided"}), 400

    # Sanitize filename
    safe_name = "".join(c for c in name if c.isalnum() or c in " -_").strip()
    if not safe_name:
        safe_name = "book"
    filename = safe_name + ".json"
    filepath = os.path.join(BOOKS_DIR, filename)

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return jsonify({"success": True, "filename": filename})


@app.route("/api/books/load", methods=["POST"])
def load_book():
    """Load a book from the books folder."""
    data = request.get_json()
    filename = data.get("filename", "").strip()
    if not filename:
        return jsonify({"error": "No filename provided"}), 400

    filepath = os.path.join(BOOKS_DIR, filename)
    if not os.path.isfile(filepath):
        return jsonify({"error": "Book not found"}), 404

    with open(filepath, "r", encoding="utf-8") as f:
        book_data = json.load(f)
    
    # Support both old format (direct data) and new format (with 'data' key)
    if "data" in book_data:
        return jsonify({
            "name": book_data.get("name", filename.replace(".json", "")),
            "data": book_data["data"]
        })
    else:
        # Old format compatibility
        return jsonify({
            "name": book_data.get("name", filename.replace(".json", "")),
            "data": {
                "toc": book_data.get("toc", []),
                "sentences": book_data.get("sentences", {}),
                "vocabs": book_data.get("vocabs", {})
            }
        })


@app.route("/api/books/delete", methods=["POST"])
def delete_book():
    """Delete a book from the books folder."""
    data = request.get_json()
    filename = data.get("filename", "").strip()
    if not filename:
        return jsonify({"error": "No filename provided"}), 400

    filepath = os.path.join(BOOKS_DIR, filename)
    if os.path.isfile(filepath):
        os.remove(filepath)

    return jsonify({"success": True})


# ===== TTS Routes =====


@app.route("/api/tts/generate", methods=["POST"])
def generate_tts():
    """Generate TTS audio for a word using Azure Speech Service."""
    data = request.get_json()
    word = data.get("word", "").strip()
    voice = data.get("voice", "en-US-AvaMultilingualNeural").strip() or "en-US-AvaMultilingualNeural"

    if not word:
        return jsonify({"error": "No word provided"}), 400

    if not speech_key or not speech_region:
        return jsonify({"error": "Azure Speech Service not configured"}), 500

    # Sanitize filename — include voice slug so different voices get separate files
    safe_name = re.sub(r'[^\w\s-]', '', word).strip().lower()
    safe_name = re.sub(r'[\s]+', '_', safe_name)
    if not safe_name:
        safe_name = "word"
    voice_slug = re.sub(r'[^\w]', '_', voice).lower()
    filename = f"{safe_name}__{voice_slug}.wav"
    filepath = os.path.join(AUDIOS_DIR, filename)

    if os.path.isfile(filepath):
        return jsonify({"success": True, "filename": filename})

    try:
        speech_config = speechsdk.SpeechConfig(
            subscription=speech_key, region=speech_region
        )
        speech_config.speech_synthesis_voice_name = voice
        audio_config = speechsdk.audio.AudioOutputConfig(filename=filepath)

        synthesizer = speechsdk.SpeechSynthesizer(
            speech_config=speech_config, audio_config=audio_config
        )
        result = synthesizer.speak_text_async(word).get()

        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            return jsonify({"success": True, "filename": filename})
        elif result.reason == speechsdk.ResultReason.Canceled:
            cancellation = result.cancellation_details
            return jsonify({"error": f"Speech synthesis canceled: {cancellation.reason}"}), 500
        else:
            return jsonify({"error": "Speech synthesis failed"}), 500
    except Exception as e:
        if os.path.isfile(filepath):
            os.remove(filepath)
        return jsonify({"error": str(e)}), 500


@app.route("/api/tts/check", methods=["POST"])
def check_tts():
    """Check if TTS audio already exists for a word."""
    data = request.get_json()
    word = data.get("word", "").strip()

    if not word:
        return jsonify({"exists": False})

    safe_name = re.sub(r'[^\w\s-]', '', word).strip().lower()
    safe_name = re.sub(r'[\s]+', '_', safe_name)
    if not safe_name:
        return jsonify({"exists": False})
    filename = safe_name + ".wav"
    filepath = os.path.join(AUDIOS_DIR, filename)

    return jsonify({"exists": os.path.isfile(filepath), "filename": filename})


@app.route("/api/tts/generate-sentence", methods=["POST"])
def generate_sentence_tts():
    """Generate TTS audio for a sentence using Azure Speech Service."""
    data = request.get_json()
    sentence_id = data.get("sentenceId", "").strip()
    text = data.get("text", "").strip()
    voice = data.get("voice", "en-US-AvaMultilingualNeural").strip() or "en-US-AvaMultilingualNeural"

    if not sentence_id or not text:
        return jsonify({"error": "No sentence ID or text provided"}), 400

    if not speech_key or not speech_region:
        return jsonify({"error": "Azure Speech Service not configured"}), 500

    # Include voice slug in filename so voice changes regenerate the audio
    voice_slug = re.sub(r'[^\w]', '_', voice).lower()
    filename = f"sentence_{sentence_id}__{voice_slug}.wav"
    filepath = os.path.join(AUDIOS_DIR, filename)

    if os.path.isfile(filepath):
        return jsonify({"success": True, "filename": filename})

    try:
        speech_config = speechsdk.SpeechConfig(
            subscription=speech_key, region=speech_region
        )
        speech_config.speech_synthesis_voice_name = voice
        audio_config = speechsdk.audio.AudioOutputConfig(filename=filepath)

        synthesizer = speechsdk.SpeechSynthesizer(
            speech_config=speech_config, audio_config=audio_config
        )
        result = synthesizer.speak_text_async(text).get()

        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            return jsonify({"success": True, "filename": filename})
        elif result.reason == speechsdk.ResultReason.Canceled:
            cancellation = result.cancellation_details
            return jsonify({"error": f"Speech synthesis canceled: {cancellation.reason}"}), 500
        else:
            return jsonify({"error": "Speech synthesis failed"}), 500
    except Exception as e:
        if os.path.isfile(filepath):
            os.remove(filepath)
        return jsonify({"error": str(e)}), 500


@app.route("/api/tts/check-sentence", methods=["POST"])
def check_sentence_tts():
    """Check if TTS audio already exists for a sentence."""
    data = request.get_json()
    sentence_id = data.get("sentenceId", "").strip()

    if not sentence_id:
        return jsonify({"exists": False})

    filename = f"sentence_{sentence_id}.wav"
    filepath = os.path.join(AUDIOS_DIR, filename)

    return jsonify({"exists": os.path.isfile(filepath), "filename": filename})


@app.route("/audios/<path:filename>")
def serve_audio(filename):
    """Serve audio files from the audios folder."""
    return send_from_directory(AUDIOS_DIR, filename)


# ===== Voice Recording Routes =====


@app.route("/api/recordings/upload", methods=["POST"])
def upload_recording():
    """Upload a voice recording for a sentence."""
    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided"}), 400
    
    audio_file = request.files["audio"]
    sentence_id = request.form.get("sentenceId", "").strip()
    
    if not sentence_id:
        return jsonify({"error": "No sentence ID provided"}), 400
    
    # Sanitize filename using sentence ID
    safe_id = re.sub(r'[^\w-]', '', sentence_id)
    filename = f"{safe_id}.webm"
    filepath = os.path.join(RECORDINGS_DIR, filename)
    
    try:
        audio_file.save(filepath)
        return jsonify({"success": True, "filename": filename})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/recordings/check", methods=["POST"])
def check_recording():
    """Check if a voice recording exists for a sentence."""
    data = request.get_json()
    sentence_id = data.get("sentenceId", "").strip()
    
    if not sentence_id:
        return jsonify({"exists": False})
    
    safe_id = re.sub(r'[^\w-]', '', sentence_id)
    filename = f"{safe_id}.webm"
    filepath = os.path.join(RECORDINGS_DIR, filename)
    
    return jsonify({"exists": os.path.isfile(filepath), "filename": filename})


@app.route("/recordings/<path:filename>")
def serve_recording(filename):
    """Serve recording files from the recordings folder."""
    return send_from_directory(RECORDINGS_DIR, filename)


# ===== Mindmap Image Routes =====


@app.route("/api/images/upload", methods=["POST"])
def upload_image():
    """Upload an image for a mindmap node (from clipboard paste)."""
    if "image" not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    image_file = request.files["image"]
    node_id = request.form.get("nodeId", "").strip()
    vocab_id = request.form.get("vocabId", "").strip()

    if not node_id or not vocab_id:
        return jsonify({"error": "No node ID or vocab ID provided"}), 400

    # Sanitize and build filename
    safe_vocab = re.sub(r'[^\w-]', '', vocab_id)
    safe_node = re.sub(r'[^\w-]', '', node_id)
    # Detect extension from content type
    content_type = image_file.content_type or "image/png"
    ext = "png"
    if "jpeg" in content_type or "jpg" in content_type:
        ext = "jpg"
    elif "gif" in content_type:
        ext = "gif"
    elif "webp" in content_type:
        ext = "webp"

    filename = f"{safe_vocab}_{safe_node}.{ext}"
    filepath = os.path.join(IMAGES_DIR, filename)

    try:
        image_file.save(filepath)
        return jsonify({"success": True, "filename": filename})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/images/delete", methods=["POST"])
def delete_image():
    """Delete a mindmap node image."""
    data = request.get_json()
    filename = data.get("filename", "").strip()

    if not filename:
        return jsonify({"error": "No filename provided"}), 400

    filepath = os.path.join(IMAGES_DIR, filename)
    if os.path.isfile(filepath):
        os.remove(filepath)

    return jsonify({"success": True})


@app.route("/images/<path:filename>")
def serve_image(filename):
    """Serve image files from the images folder."""
    return send_from_directory(IMAGES_DIR, filename)


# ===== Static Files =====


@app.route("/")
def serve_index():
    return send_from_directory(".", "index.html")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print(f"Server running at http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
