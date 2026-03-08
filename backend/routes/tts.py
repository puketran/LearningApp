"""TTS Blueprint — generate and serve speech audio files."""

import logging
import os

from flask import Blueprint, jsonify, request, send_from_directory

from ..config import AUDIOS_DIR, SPEECH_KEY, SPEECH_REGION
from ..services.tts_service import synthesize
from ..utils.file_utils import sanitize_name, voice_slug

logger = logging.getLogger(__name__)

tts_bp = Blueprint("tts", __name__)


@tts_bp.route("/api/tts/generate", methods=["POST"])
def generate_tts():
    """Generate TTS audio for a word/phrase; skip synthesis if cached."""
    data = request.get_json()
    word = data.get("word", "").strip()
    voice = (
        data.get("voice", "en-US-AvaMultilingualNeural").strip()
        or "en-US-AvaMultilingualNeural"
    )

    if not word:
        return jsonify({"error": "No word provided"}), 400
    if not SPEECH_KEY or not SPEECH_REGION:
        return jsonify({"error": "Azure Speech Service not configured"}), 500

    filename = f"{sanitize_name(word)}__{voice_slug(voice)}.wav"
    filepath = os.path.join(AUDIOS_DIR, filename)

    if os.path.isfile(filepath):
        return jsonify({"success": True, "filename": filename})

    result = synthesize(word, voice, filepath)
    if "error" in result:
        return jsonify(result), 500
    return jsonify({"success": True, "filename": filename})


@tts_bp.route("/api/tts/check", methods=["POST"])
def check_tts():
    """Check whether cached TTS audio exists for a word."""
    data = request.get_json()
    word = data.get("word", "").strip()
    if not word:
        return jsonify({"exists": False})

    filename = sanitize_name(word) + ".wav"
    return jsonify(
        {"exists": os.path.isfile(os.path.join(AUDIOS_DIR, filename)), "filename": filename}
    )


@tts_bp.route("/api/tts/generate-sentence", methods=["POST"])
def generate_sentence_tts():
    """Generate TTS audio for a full sentence; skip synthesis if cached."""
    data = request.get_json()
    sentence_id = data.get("sentenceId", "").strip()
    text = data.get("text", "").strip()
    voice = (
        data.get("voice", "en-US-AvaMultilingualNeural").strip()
        or "en-US-AvaMultilingualNeural"
    )

    if not sentence_id or not text:
        return jsonify({"error": "No sentence ID or text provided"}), 400
    if not SPEECH_KEY or not SPEECH_REGION:
        return jsonify({"error": "Azure Speech Service not configured"}), 500

    filename = f"sentence_{sentence_id}__{voice_slug(voice)}.wav"
    filepath = os.path.join(AUDIOS_DIR, filename)

    if os.path.isfile(filepath):
        return jsonify({"success": True, "filename": filename})

    result = synthesize(text, voice, filepath)
    if "error" in result:
        return jsonify(result), 500
    return jsonify({"success": True, "filename": filename})


@tts_bp.route("/api/tts/check-sentence", methods=["POST"])
def check_sentence_tts():
    """Check whether cached TTS audio exists for a sentence."""
    data = request.get_json()
    sentence_id = data.get("sentenceId", "").strip()
    if not sentence_id:
        return jsonify({"exists": False})

    filename = f"sentence_{sentence_id}.wav"
    return jsonify(
        {"exists": os.path.isfile(os.path.join(AUDIOS_DIR, filename)), "filename": filename}
    )


@tts_bp.route("/audios/<path:filename>")
def serve_audio(filename):
    """Serve a WAV file from the audios directory."""
    return send_from_directory(AUDIOS_DIR, filename)
