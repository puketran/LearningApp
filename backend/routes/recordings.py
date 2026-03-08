"""Voice recordings Blueprint — upload, check, and serve WebM recordings."""

import logging
import os

from flask import Blueprint, jsonify, request, send_from_directory

from ..config import RECORDINGS_DIR
from ..utils.file_utils import safe_id

logger = logging.getLogger(__name__)

recordings_bp = Blueprint("recordings", __name__)


@recordings_bp.route("/api/recordings/upload", methods=["POST"])
def upload_recording():
    """Accept a WebM audio blob and persist it keyed by sentence ID."""
    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files["audio"]
    sentence_id = request.form.get("sentenceId", "").strip()
    if not sentence_id:
        return jsonify({"error": "No sentence ID provided"}), 400

    filename = f"{safe_id(sentence_id)}.webm"
    filepath = os.path.join(RECORDINGS_DIR, filename)

    try:
        audio_file.save(filepath)
        logger.info("Recording saved: %s", filename)
        return jsonify({"success": True, "filename": filename})
    except Exception as exc:
        logger.exception("upload_recording error")
        return jsonify({"error": str(exc)}), 500


@recordings_bp.route("/api/recordings/check", methods=["POST"])
def check_recording():
    """Return whether a recording file exists for the given sentence ID."""
    data = request.get_json()
    sentence_id = data.get("sentenceId", "").strip()
    if not sentence_id:
        return jsonify({"exists": False})

    filename = f"{safe_id(sentence_id)}.webm"
    return jsonify(
        {
            "exists": os.path.isfile(os.path.join(RECORDINGS_DIR, filename)),
            "filename": filename,
        }
    )


@recordings_bp.route("/recordings/<path:filename>")
def serve_recording(filename):
    """Serve a WebM recording file from the recordings directory."""
    return send_from_directory(RECORDINGS_DIR, filename)
