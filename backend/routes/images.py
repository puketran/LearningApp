"""Mindmap node images Blueprint — upload, delete, and serve images."""

import logging
import os

from flask import Blueprint, jsonify, request, send_from_directory

from ..config import IMAGES_DIR
from ..utils.file_utils import safe_id

logger = logging.getLogger(__name__)

images_bp = Blueprint("images", __name__)

# Map MIME type → file extension
_MIME_TO_EXT: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/png": "png",
}


@images_bp.route("/api/images/upload", methods=["POST"])
def upload_image():
    """Save a pasted clipboard image for a mindmap node."""
    if "image" not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    image_file = request.files["image"]
    node_id = request.form.get("nodeId", "").strip()
    vocab_id = request.form.get("vocabId", "").strip()

    if not node_id or not vocab_id:
        return jsonify({"error": "No node ID or vocab ID provided"}), 400

    content_type = image_file.content_type or "image/png"
    ext = _MIME_TO_EXT.get(content_type, "png")
    filename = f"{safe_id(vocab_id)}_{safe_id(node_id)}.{ext}"
    filepath = os.path.join(IMAGES_DIR, filename)

    try:
        image_file.save(filepath)
        logger.info("Image saved: %s", filename)
        return jsonify({"success": True, "filename": filename})
    except Exception as exc:
        logger.exception("upload_image error")
        return jsonify({"error": str(exc)}), 500


@images_bp.route("/api/images/delete", methods=["POST"])
def delete_image():
    """Remove a node image file from disk."""
    data = request.get_json()
    filename = data.get("filename", "").strip()
    if not filename:
        return jsonify({"error": "No filename provided"}), 400

    filepath = os.path.join(IMAGES_DIR, filename)
    if os.path.isfile(filepath):
        os.remove(filepath)
        logger.info("Image deleted: %s", filename)

    return jsonify({"success": True})


@images_bp.route("/images/<path:filename>")
def serve_image(filename):
    """Serve an image file from the images directory."""
    return send_from_directory(IMAGES_DIR, filename)
