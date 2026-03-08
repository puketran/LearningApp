"""Settings API — GET / POST the data folder path."""

import glob
import os
import sys
import time

from flask import Blueprint, jsonify, request

from ..config import APP_CONFIG_FILE, BASE_DIR, get_audios_dir, get_books_dir, get_data_dir, get_images_dir, get_recordings_dir, load_app_config, save_app_config

settings_bp = Blueprint("settings", __name__)

_start_time = time.time()


@settings_bp.get("/api/settings")
def get_settings():
    """Return current active settings."""
    cfg = load_app_config()
    return jsonify({
        "data_dir": get_data_dir(),
        "data_dir_config": cfg.get("data_dir", ""),
        "base_dir": BASE_DIR,
    })


@settings_bp.get("/api/status")
def get_status():
    """Return a detailed status report used by the web log console."""
    data_dir = get_data_dir()

    def _dir_info(path: str) -> dict:
        exists = os.path.isdir(path)
        if not exists:
            return {"path": path, "exists": False, "count": 0, "size_kb": 0}
        files = [f for f in os.listdir(path) if os.path.isfile(os.path.join(path, f))]
        total = sum(os.path.getsize(os.path.join(path, f)) for f in files)
        return {
            "path": path,
            "exists": True,
            "count": len(files),
            "size_kb": round(total / 1024, 1),
        }

    # Disk free space (best-effort)
    disk_free_mb = None
    try:
        st = os.statvfs(data_dir) if hasattr(os, "statvfs") else None
        if st:
            disk_free_mb = round(st.f_bavail * st.f_frsize / (1024 * 1024), 1)
    except Exception:
        pass

    uptime_s = int(time.time() - _start_time)

    return jsonify({
        "ok": True,
        "platform": sys.platform,
        "uptime_seconds": uptime_s,
        "data_dir": data_dir,
        "data_dir_exists": os.path.isdir(data_dir),
        "disk_free_mb": disk_free_mb,
        "dirs": {
            "books":      _dir_info(get_books_dir()),
            "images":     _dir_info(get_images_dir()),
            "audios":     _dir_info(get_audios_dir()),
            "recordings": _dir_info(get_recordings_dir()),
        },
    })


@settings_bp.post("/api/settings")
def update_settings():
    """Save new data_dir to app_config.json. Takes effect after server restart."""
    body = request.get_json(silent=True) or {}
    new_data_dir = (body.get("data_dir") or "").strip()

    if not new_data_dir:
        return jsonify({"error": "data_dir is required"}), 400

    # Resolve to absolute path.
    # Handle both Unix (/foo/bar) and Windows (C:\foo\bar) absolute paths —
    # os.path.isabs() returns False for Windows paths when running on Linux.
    def _is_absolute(p: str) -> bool:
        return os.path.isabs(p) or (len(p) >= 3 and p[1] == ":")

    if not _is_absolute(new_data_dir):
        new_data_dir = os.path.normpath(os.path.join(BASE_DIR, new_data_dir))
    else:
        new_data_dir = os.path.normpath(new_data_dir)

    # Attempt to create it so user gets an error immediately if path is invalid
    try:
        os.makedirs(new_data_dir, exist_ok=True)
        for sub in ("books", "audios", "recordings", "images"):
            os.makedirs(os.path.join(new_data_dir, sub), exist_ok=True)
    except OSError as exc:
        return jsonify({"error": f"Cannot create directory: {exc}"}), 400

    cfg = load_app_config()
    cfg["data_dir"] = new_data_dir
    save_app_config(cfg)

    return jsonify({
        "ok": True,
        "data_dir": new_data_dir,
        "message": "Data folder updated. Books will now load from the new location.",
    })
