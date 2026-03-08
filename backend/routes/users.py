"""User management Blueprint.

Users are stored in <data_dir>/users.json as a list:
  [{"id": "<uuid4>", "name": "Alice", "pin": "1234"}, ...]

Routes
------
GET  /api/users           – list all users (id + name only, no PIN)
POST /api/users           – create user  {name, pin}  → {id, name}
POST /api/users/login     – verify PIN   {id, pin}    → {ok, id, name}
DELETE /api/users/<id>    – delete user
"""

import json
import logging
import os
import uuid

from flask import Blueprint, jsonify, request

from ..config import get_data_dir

logger = logging.getLogger(__name__)

users_bp = Blueprint("users", __name__, url_prefix="/api/users")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _users_file() -> str:
    return os.path.join(get_data_dir(), "users.json")


def _load_users() -> list:
    path = _users_file()
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _save_users(users: list) -> None:
    path = _users_file()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(users, fh, ensure_ascii=False, indent=2)


# ── Book-list helpers (called by books.py) ────────────────────────────────────

def get_user_books(user_id: str) -> list:
    """Return the list of book filenames stored for *user_id* in users.json."""
    for u in _load_users():
        if u["id"] == user_id:
            return u.get("books") or []
    return []


def add_book_to_user(user_id: str, filename: str) -> None:
    """Append *filename* to the user's books list (no-op if already present)."""
    users = _load_users()
    for u in users:
        if u["id"] == user_id:
            books = u.setdefault("books", [])
            if filename not in books:
                books.append(filename)
            _save_users(users)
            logger.info("[USERS] added book '%s' → user %s", filename, user_id)
            return
    logger.warning("[USERS] add_book_to_user: user %s not found", user_id)


def remove_book_from_user(user_id: str, filename: str) -> None:
    """Remove *filename* from the user's books list."""
    users = _load_users()
    for u in users:
        if u["id"] == user_id:
            before = len(u.get("books") or [])
            u["books"] = [b for b in (u.get("books") or []) if b != filename]
            if len(u["books"]) != before:
                _save_users(users)
                logger.info("[USERS] removed book '%s' from user %s", filename, user_id)
            return


def rename_book_in_user(user_id: str, old_filename: str, new_filename: str) -> None:
    """Replace *old_filename* with *new_filename* in the user's books list."""
    users = _load_users()
    for u in users:
        if u["id"] == user_id:
            u["books"] = [
                new_filename if b == old_filename else b
                for b in (u.get("books") or [])
            ]
            _save_users(users)
            logger.info("[USERS] renamed book %s → %s for user %s", old_filename, new_filename, user_id)
            return


# ── Routes ─────────────────────────────────────────────────────────────────────

@users_bp.route("", methods=["GET"])
def list_users():
    """Return all users — name and id only (PIN never sent to client)."""
    users = _load_users()
    return jsonify({"users": [{"id": u["id"], "name": u["name"]} for u in users]})


@users_bp.route("", methods=["POST"])
def create_user():
    """Create a new user with name + 4-digit PIN."""
    body = request.get_json(force=True, silent=True) or {}
    name = (body.get("name") or "").strip()
    pin = str(body.get("pin") or "").strip()

    if not name:
        return jsonify({"error": "Name is required"}), 400
    if not pin.isdigit() or len(pin) != 4:
        return jsonify({"error": "PIN must be exactly 4 digits"}), 400

    users = _load_users()
    # Check for duplicate name (case-insensitive)
    if any(u["name"].lower() == name.lower() for u in users):
        return jsonify({"error": "A user with that name already exists"}), 409

    new_user = {"id": str(uuid.uuid4()), "name": name, "pin": pin}
    users.append(new_user)
    _save_users(users)
    logger.info("User created: %s (%s)", name, new_user["id"])
    return jsonify({"id": new_user["id"], "name": new_user["name"]}), 201


@users_bp.route("/login", methods=["POST"])
def login_user():
    """Verify a user's PIN. Returns {ok: true, id, name} or {ok: false}."""
    body = request.get_json(force=True, silent=True) or {}
    user_id = (body.get("id") or "").strip()
    pin = str(body.get("pin") or "").strip()

    users = _load_users()
    for u in users:
        if u["id"] == user_id:
            if u["pin"] == pin:
                return jsonify({"ok": True, "id": u["id"], "name": u["name"]})
            return jsonify({"ok": False, "error": "Wrong PIN"}), 200
    return jsonify({"ok": False, "error": "User not found"}), 404


@users_bp.route("/<user_id>", methods=["DELETE"])
def delete_user(user_id: str):
    """Delete a user by id."""
    users = _load_users()
    new_users = [u for u in users if u["id"] != user_id]
    if len(new_users) == len(users):
        return jsonify({"error": "User not found"}), 404
    _save_users(new_users)
    logger.info("User deleted: %s", user_id)
    return jsonify({"success": True})
