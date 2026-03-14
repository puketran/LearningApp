"""Mindmap undo/checkpoint API.

Provides server-side named checkpoints for mindmap states so that named
restore-points survive page refreshes and can be retrieved cross-session.

Endpoints
---------
POST   /api/mindmap/checkpoint
    Body: { "vocabId": str, "label": str, "data": object }
    Saves a named checkpoint of the mindmap tree for vocabId.
    Returns: { "id": str, "vocabId": str, "label": str, "createdAt": ISO }

GET    /api/mindmap/checkpoints/<vocab_id>
    Returns the list of checkpoints for the given vocabId (metadata only).
    Returns: { "checkpoints": [ {id, vocabId, label, createdAt}, ... ] }

GET    /api/mindmap/checkpoint/<vocab_id>/<checkpoint_id>
    Returns the full checkpoint including the saved mindmap data.
    Returns: { "id", "vocabId", "label", "createdAt", "data": object }

DELETE /api/mindmap/checkpoint/<vocab_id>/<checkpoint_id>
    Deletes a single checkpoint.
    Returns: { "success": true }

DELETE /api/mindmap/checkpoints/<vocab_id>
    Deletes all checkpoints for the given vocabId.
    Returns: { "success": true, "deleted": int }

GET    /api/mindmap/undo/status
    Query params: vocabId, canUndo (bool), canRedo (bool), undoCount, redoCount
    Lightweight endpoint the client can call to report / query its undo state.
    Returns: { "received": true, ... } (acknowledgement only – state is client-held).
"""

import logging
import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

logger = logging.getLogger(__name__)

mindmap_bp = Blueprint("mindmap", __name__, url_prefix="/api/mindmap")

# In-memory store: { vocab_id -> [checkpoint_dict, ...] }
# Each checkpoint: { id, vocabId, label, createdAt, data }
_MAX_CHECKPOINTS_PER_VOCAB = 20
_checkpoints: dict[str, list[dict]] = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_list(vocab_id: str) -> list[dict]:
    """Return (possibly empty) checkpoint list for *vocab_id*."""
    return _checkpoints.setdefault(vocab_id, [])


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@mindmap_bp.route("/checkpoint", methods=["POST"])
def save_checkpoint():
    """Save a named checkpoint of a mindmap tree."""
    body = request.get_json(silent=True) or {}
    vocab_id = (body.get("vocabId") or "").strip()
    label = (body.get("label") or "checkpoint").strip()
    data = body.get("data")

    if not vocab_id:
        return jsonify({"error": "vocabId is required"}), 400
    if data is None:
        return jsonify({"error": "data is required"}), 400

    cp = {
        "id": str(uuid.uuid4()),
        "vocabId": vocab_id,
        "label": label,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }

    lst = _get_list(vocab_id)
    lst.append(cp)
    # Trim oldest entries when list grows too long
    if len(lst) > _MAX_CHECKPOINTS_PER_VOCAB:
        _checkpoints[vocab_id] = lst[-_MAX_CHECKPOINTS_PER_VOCAB:]

    logger.info("[mindmap] checkpoint saved: vocabId=%s label=%r id=%s", vocab_id, label, cp["id"])
    return jsonify({k: cp[k] for k in ("id", "vocabId", "label", "createdAt")}), 201


@mindmap_bp.route("/checkpoints/<vocab_id>", methods=["GET"])
def list_checkpoints(vocab_id: str):
    """List checkpoints for a vocab (metadata only, no tree data)."""
    lst = _get_list(vocab_id)
    return jsonify({
        "checkpoints": [
            {k: c[k] for k in ("id", "vocabId", "label", "createdAt")}
            for c in reversed(lst)   # newest first
        ]
    })


@mindmap_bp.route("/checkpoint/<vocab_id>/<checkpoint_id>", methods=["GET"])
def get_checkpoint(vocab_id: str, checkpoint_id: str):
    """Retrieve a full checkpoint (including tree data) by id."""
    lst = _get_list(vocab_id)
    cp = next((c for c in lst if c["id"] == checkpoint_id), None)
    if cp is None:
        return jsonify({"error": "Checkpoint not found"}), 404
    return jsonify(cp)


@mindmap_bp.route("/checkpoint/<vocab_id>/<checkpoint_id>", methods=["DELETE"])
def delete_checkpoint(vocab_id: str, checkpoint_id: str):
    """Delete a single checkpoint."""
    lst = _get_list(vocab_id)
    before = len(lst)
    _checkpoints[vocab_id] = [c for c in lst if c["id"] != checkpoint_id]
    if len(_checkpoints[vocab_id]) == before:
        return jsonify({"error": "Checkpoint not found"}), 404
    return jsonify({"success": True})


@mindmap_bp.route("/checkpoints/<vocab_id>", methods=["DELETE"])
def clear_checkpoints(vocab_id: str):
    """Delete all checkpoints for a vocab."""
    deleted = len(_checkpoints.pop(vocab_id, []))
    return jsonify({"success": True, "deleted": deleted})


@mindmap_bp.route("/undo/status", methods=["GET"])
def undo_status():
    """Lightweight acknowledgement endpoint for client undo-state reporting.

    The client (mindmapAPI) can call this to report its current undo/redo
    counts.  The server merely acknowledges; actual undo state lives on the
    client.  Query params: vocabId, canUndo, canRedo, undoCount, redoCount.
    """
    vocab_id = request.args.get("vocabId", "")
    can_undo = request.args.get("canUndo", "false").lower() == "true"
    can_redo = request.args.get("canRedo", "false").lower() == "true"
    undo_count = request.args.get("undoCount", 0)
    redo_count = request.args.get("redoCount", 0)
    checkpoint_count = len(_get_list(vocab_id)) if vocab_id else 0
    return jsonify({
        "received": True,
        "vocabId": vocab_id,
        "canUndo": can_undo,
        "canRedo": can_redo,
        "undoCount": undo_count,
        "redoCount": redo_count,
        "savedCheckpoints": checkpoint_count,
    })
