"""Book management Blueprint — CRUD operations on book JSON files."""

import glob
import io
import json
import logging
import os
import zipfile

from flask import Blueprint, jsonify, request, send_file

from ..config import get_books_dir, get_images_dir

logger = logging.getLogger(__name__)

books_bp = Blueprint("books", __name__, url_prefix="/api/books")


def _sanitize_book_name(name: str) -> str:
    """Return a filesystem-safe version of *name* (alphanumeric + space/-/_)."""
    safe = "".join(c for c in name if c.isalnum() or c in " -_").strip()
    return safe or "book"


@books_bp.route("", methods=["GET"])
def list_books():
    """List every book JSON file found in the books directory.

    Optional query param ``user_id`` — when supplied only books whose stored
    ``user_id`` field matches are returned.  Books that have no ``user_id``
    field (legacy / pre-user books) are shown to everyone.
    """
    filter_uid = request.args.get("user_id", "").strip() or None
    books_dir = get_books_dir()
    logger.info("[LIST] scanning books dir: %s", books_dir)
    books = []
    for filepath in glob.glob(os.path.join(books_dir, "*.json")):
        try:
            with open(filepath, encoding="utf-8") as fh:
                data = json.load(fh)
            name = data.get("name", os.path.basename(filepath).replace(".json", ""))
            # Pull language config from data.config (new format) or top-level config
            inner = data.get("data", data)
            cfg = inner.get("config", {}) if isinstance(inner, dict) else {}

            # User filtering: when a user is logged in, only show their books.
            # Books with no user_id were created before the user system —
            # they are hidden unless no filter is active (admin/no-user mode).
            book_uid = data.get("user_id")
            if filter_uid and book_uid != filter_uid:
                continue

            logger.info("[LIST]   + serving: %s", filepath)
            books.append(
                {
                    "filename": os.path.basename(filepath),
                    "name": name,
                    "chapters": len(data.get("toc", []) or (inner.get("toc", []) if isinstance(inner, dict) else [])),
                    "fromLang": cfg.get("fromLang", ""),
                    "toLang": cfg.get("toLang", ""),
                }
            )
        except Exception:
            continue
    return jsonify({"books": books})


@books_bp.route("/save", methods=["POST"])
def save_book():
    """Persist a book's data to the books directory as a JSON file."""
    data = request.get_json(force=True, silent=True) or {}
    name = data.get("name", "Untitled").strip()
    if not name:
        return jsonify({"error": "No name provided"}), 400

    # Preserve user_id when supplied so books stay linked to their owner
    user_id = (data.get("user_id") or "").strip() or None
    if user_id:
        data["user_id"] = user_id
    elif "user_id" not in data:
        pass  # legacy book — keep as-is

    # Determine filename -------------------------------------------------------
    # Re-use the existing filename when the frontend tells us one (i.e. the book
    # was already saved before).  This prevents a second file being created when
    # re-saving or when a user's book has the same name as another user's book.
    existing_filename = (data.get("filename") or "").strip()
    books_dir = get_books_dir()
    if existing_filename and os.path.isfile(os.path.join(books_dir, existing_filename)):
        filename = existing_filename
    else:
        safe = _sanitize_book_name(name)
        # Namespace by user so two users can have books with the same title
        filename = f"{user_id[:8]}_{safe}.json" if user_id else f"{safe}.json"

    filepath = os.path.join(books_dir, filename)

    try:
        logger.info("[SAVE] writing book to: %s", filepath)
        with open(filepath, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
        logger.info("[SAVE] book saved OK: %s", filepath)
        return jsonify({"success": True, "filename": filename})
    except Exception as exc:
        logger.exception("save_book error")
        return jsonify({"error": str(exc)}), 500


@books_bp.route("/load", methods=["POST"])
def load_book():
    """Load a book JSON file, supporting both old and new data formats."""
    data = request.get_json(force=True, silent=True) or {}
    filename = data.get("filename", "").strip()
    if not filename:
        return jsonify({"error": "No filename provided"}), 400

    filepath = os.path.join(get_books_dir(), filename)
    logger.info("[LOAD] reading book: %s", filepath)
    if not os.path.isfile(filepath):
        logger.warning("[LOAD] NOT FOUND: %s", filepath)
        return jsonify({"error": "Book not found"}), 404

    try:
        with open(filepath, encoding="utf-8") as fh:
            book_data = json.load(fh)

        display_name = book_data.get("name", filename.replace(".json", ""))
        logger.info("[LOAD] serving book '%s' from: %s", display_name, filepath)

        if "data" in book_data:
            # Current format: { name, data: { toc, sentences, vocabs, ... } }
            return jsonify({"name": display_name, "data": book_data["data"]})

        # Legacy format: flat structure at root level
        return jsonify(
            {
                "name": display_name,
                "data": {
                    "toc": book_data.get("toc", []),
                    "sentences": book_data.get("sentences", {}),
                    "vocabs": book_data.get("vocabs", {}),
                },
            }
        )
    except Exception as exc:
        logger.exception("load_book error")
        return jsonify({"error": str(exc)}), 500


@books_bp.route("/delete", methods=["POST"])
def delete_book():
    """Remove a book JSON file from disk."""
    data = request.get_json(force=True, silent=True) or {}
    filename = data.get("filename", "").strip()
    if not filename:
        return jsonify({"error": "No filename provided"}), 400

    filepath = os.path.join(get_books_dir(), filename)
    try:
        if os.path.isfile(filepath):
            os.remove(filepath)
            logger.info("Book deleted: %s", filename)
        return jsonify({"success": True})
    except Exception as exc:
        logger.exception("delete_book error")
        return jsonify({"error": str(exc)}), 500


@books_bp.route("/rename", methods=["POST"])
def rename_book():
    """Rename a book — updates both the JSON file's name field and the filename on disk."""
    # force=True accepts the body regardless of Content-Type header
    # silent=True returns None instead of raising on parse error
    data = request.get_json(force=True, silent=True) or {}
    old_filename = data.get("filename", "").strip()
    new_name = data.get("newName", "").strip()

    if not old_filename:
        return jsonify({"error": "No filename provided"}), 400
    if not new_name:
        return jsonify({"error": "No new name provided"}), 400

    old_path = os.path.join(get_books_dir(), old_filename)
    if not os.path.isfile(old_path):
        return jsonify({"error": f"Book file not found: {old_filename}"}), 404

    try:
        # Read existing data, update name
        with open(old_path, encoding="utf-8") as fh:
            book_data = json.load(fh)
        book_data["name"] = new_name

        # Build the new on-disk filename
        new_filename = _sanitize_book_name(new_name) + ".json"

        # Avoid colliding with a *different* existing file
        counter = 1
        candidate = new_filename
        while (
            os.path.isfile(os.path.join(get_books_dir(), candidate))
            and candidate != old_filename
        ):
            candidate = f"{_sanitize_book_name(new_name)}_{counter}.json"
            counter += 1
        new_filename = candidate
        new_path = os.path.join(get_books_dir(), new_filename)

        # Write the updated JSON to the (possibly new) path
        with open(new_path, "w", encoding="utf-8") as fh:
            json.dump(book_data, fh, ensure_ascii=False, indent=2)

        # Remove the old file only when the path actually changed
        if os.path.abspath(old_path) != os.path.abspath(new_path) and os.path.isfile(old_path):
            os.remove(old_path)

        logger.info("Book renamed: %s → %s", old_filename, new_filename)
        return jsonify({"success": True, "filename": new_filename, "name": new_name})

    except Exception as exc:
        logger.exception("rename_book error")
        return jsonify({"error": str(exc)}), 500


# ── Helper ────────────────────────────────────────────────────────────────────


def _collect_images(node: dict, found: set) -> None:
    """Recursively walk a mindmap node tree and collect image filenames."""
    img = node.get("image")
    if img:
        found.add(img)
    for child in node.get("children", []):
        _collect_images(child, found)


def _find_book_images(book_data: dict) -> set:
    """Return the set of image filenames referenced anywhere in *book_data*."""
    images: set = set()
    mindmaps = book_data.get("data", book_data).get("mindmaps", {})
    for root_node in mindmaps.values():
        if isinstance(root_node, dict):
            _collect_images(root_node, images)
    return images


# ── Export ────────────────────────────────────────────────────────────────────


@books_bp.route("/export/<path:filename>", methods=["GET"])
def export_book(filename: str):
    """Stream a ZIP archive containing the book JSON and any mindmap images.

    The archive layout is::

        book.json
        images/
            <node_image_1>.png
            <node_image_2>.jpg
            …
    """
    filepath = os.path.join(get_books_dir(), filename)
    if not os.path.isfile(filepath):
        return jsonify({"error": "Book not found"}), 404

    with open(filepath, encoding="utf-8") as fh:
        book_data = json.load(fh)

    book_name = book_data.get("name", filename.replace(".json", ""))

    # Build ZIP in memory
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        # 1. The book JSON itself
        zf.writestr("book.json", json.dumps(book_data, ensure_ascii=False, indent=2))

        # 2. Referenced mindmap images (skip audio — by design)
        for img_filename in _find_book_images(book_data):
            img_path = os.path.join(get_images_dir(), img_filename)
            if os.path.isfile(img_path):
                zf.write(img_path, os.path.join("images", img_filename))
            else:
                logger.warning("Export: image not found on disk: %s", img_filename)

    buf.seek(0)
    safe_name = "".join(c for c in book_name if c.isalnum() or c in " -_").strip() or "book"
    download_name = f"{safe_name}.zip"

    logger.info("Exporting book '%s' → %s", book_name, download_name)
    return send_file(
        buf,
        mimetype="application/zip",
        as_attachment=True,
        download_name=download_name,
    )


# ── Import ────────────────────────────────────────────────────────────────────


@books_bp.route("/import", methods=["POST"])
def import_book():
    """Accept a ZIP archive previously created by the export endpoint.

    Extracts ``book.json`` to the books directory and any files inside
    ``images/`` to the images directory.  Returns the imported book's name
    and new filename so the frontend can immediately open it.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    zip_file = request.files["file"]
    if not zip_file.filename.lower().endswith(".zip"):
        return jsonify({"error": "File must be a .zip archive"}), 400

    try:
        buf = io.BytesIO(zip_file.read())
        with zipfile.ZipFile(buf, "r") as zf:
            names = zf.namelist()

            # ── Validate: must contain book.json ──────────────────────────
            if "book.json" not in names:
                return jsonify({"error": "Invalid archive: book.json not found"}), 400

            # ── Read book JSON ────────────────────────────────────────────
            book_raw = zf.read("book.json").decode("utf-8")
            book_data = json.loads(book_raw)

            # Honour caller-supplied name override (from the import modal)
            override_name = request.form.get("name", "").strip()
            if override_name:
                book_data["name"] = override_name

            # Tag the book with the importing user's id (if provided)
            import_uid = request.form.get("user_id", "").strip()
            if import_uid:
                book_data["user_id"] = import_uid

            # Ensure language config exists (backwards compat)
            inner = book_data.get("data", book_data)
            if isinstance(inner, dict) and "config" not in inner:
                inner["config"] = {
                    "fromLang": "English",
                    "fromVoice": "en-US-AvaMultilingualNeural",
                    "toLang": "Vietnamese",
                }

            book_name = book_data.get("name", "Imported Book").strip() or "Imported Book"

            # Build filename — namespace by user to prevent collisions between users
            safe = "".join(c for c in book_name if c.isalnum() or c in " -_").strip() or "book"
            base = f"{import_uid[:8]}_{safe}" if import_uid else safe
            candidate = base + ".json"
            counter = 1
            while os.path.isfile(os.path.join(get_books_dir(), candidate)):
                candidate = f"{base}_{counter}.json"
                counter += 1

            dest_path = os.path.join(get_books_dir(), candidate)
            logger.info("[IMPORT] writing book to: %s", dest_path)
            with open(dest_path, "w", encoding="utf-8") as fh:
                json.dump(book_data, fh, ensure_ascii=False, indent=2)
            logger.info("[IMPORT] book saved OK: %s", dest_path)

            # ── Extract images ────────────────────────────────────────────
            for name in names:
                if name.startswith("images/") and not name.endswith("/"):
                    img_filename = os.path.basename(name)
                    if not img_filename:
                        continue
                    img_dest = os.path.join(get_images_dir(), img_filename)
                    logger.info("[IMPORT] extracting image to: %s", img_dest)
                    with open(img_dest, "wb") as fh:
                        fh.write(zf.read(name))
                    logger.info("[IMPORT] image extracted OK: %s", img_dest)

        return jsonify({"success": True, "name": book_name, "filename": candidate})

    except zipfile.BadZipFile:
        return jsonify({"error": "Invalid or corrupted ZIP file"}), 400
    except Exception as exc:
        logger.exception("import_book error")
        return jsonify({"error": str(exc)}), 500
