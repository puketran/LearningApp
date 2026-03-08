"""
Application configuration.
All values are read from environment variables (via .env).
Data folder can be overridden via app_config.json (edited from the Settings UI).
"""

import json
import logging
import os
import shutil

from dotenv import load_dotenv

load_dotenv()

# ── Directory layout ──────────────────────────────────────────────────────────
# BASE_DIR is the project root (one level above backend/)
BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FRONTEND_DIR: str = os.path.join(BASE_DIR, "frontend")

# ── app_config.json — user-editable settings (written by Settings UI) ─────────
APP_CONFIG_FILE: str = os.path.join(BASE_DIR, "app_config.json")


def load_app_config() -> dict:
    """Load app_config.json; return empty dict if missing or invalid."""
    try:
        with open(APP_CONFIG_FILE, "r", encoding="utf-8") as _f:
            return json.load(_f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_app_config(data: dict) -> None:
    """Persist settings to app_config.json."""
    with open(APP_CONFIG_FILE, "w", encoding="utf-8") as _f:
        json.dump(data, _f, indent=2)


_app_cfg = load_app_config()

# DATA_DIR priority: app_config.json > .env > default "data"
_raw_data_dir: str = _app_cfg.get("data_dir") or os.getenv("DATA_DIR", "data")
DATA_DIR: str = os.path.normpath(
    _raw_data_dir
    if os.path.isabs(_raw_data_dir)
    else os.path.join(BASE_DIR, _raw_data_dir)
)

BOOKS_DIR: str = os.path.join(DATA_DIR, "books")
AUDIOS_DIR: str = os.path.join(DATA_DIR, "audios")
RECORDINGS_DIR: str = os.path.join(DATA_DIR, "recordings")
IMAGES_DIR: str = os.path.join(DATA_DIR, "images")

# Ensure all data directories exist on startup
for _dir in [BOOKS_DIR, AUDIOS_DIR, RECORDINGS_DIR, IMAGES_DIR]:
    os.makedirs(_dir, exist_ok=True)


# ── Dynamic getters — re-read app_config.json on every call ───────────────────
# Use these in route handlers so the active folder updates immediately when the
# user changes it via the Settings UI (no server restart needed).

def _resolve_data_dir() -> str:
    cfg = load_app_config()
    raw = cfg.get("data_dir") or os.getenv("DATA_DIR", "data")
    # Detect Windows absolute paths (C:\...) even when running on Linux
    def _is_absolute(p: str) -> bool:
        return os.path.isabs(p) or (len(p) >= 3 and p[1] == ":")
    return os.path.normpath(raw if _is_absolute(raw) else os.path.join(BASE_DIR, raw))


def get_data_dir() -> str:
    """Return the current DATA_DIR, reading app_config.json fresh each time."""
    return _resolve_data_dir()


def get_books_dir() -> str:
    d = os.path.join(_resolve_data_dir(), "books")
    os.makedirs(d, exist_ok=True)
    return d


def get_audios_dir() -> str:
    d = os.path.join(_resolve_data_dir(), "audios")
    os.makedirs(d, exist_ok=True)
    return d


def get_recordings_dir() -> str:
    d = os.path.join(_resolve_data_dir(), "recordings")
    os.makedirs(d, exist_ok=True)
    return d


def get_images_dir() -> str:
    d = os.path.join(_resolve_data_dir(), "images")
    os.makedirs(d, exist_ok=True)
    return d

# ── One-time migration: move root-level legacy folders into DATA_DIR ──────────
# Runs only when the old folder still exists at the project root and the new
# destination is empty (so we never overwrite data that was already migrated).
_LEGACY_DIRS: dict[str, str] = {
    "books": BOOKS_DIR,
    "audios": AUDIOS_DIR,
    "recordings": RECORDINGS_DIR,
    "images": IMAGES_DIR,
}
for _legacy_name, _new_dir in _LEGACY_DIRS.items():
    _legacy_path = os.path.join(BASE_DIR, _legacy_name)
    if (
        os.path.normcase(os.path.abspath(_legacy_path))
        != os.path.normcase(os.path.abspath(_new_dir))
        and os.path.isdir(_legacy_path)
        and any(os.scandir(_legacy_path))          # legacy has files
        and not any(os.scandir(_new_dir))           # new location is empty
    ):
        for _item in os.listdir(_legacy_path):
            shutil.move(
                os.path.join(_legacy_path, _item),
                os.path.join(_new_dir, _item),
            )
        try:
            os.rmdir(_legacy_path)   # remove only if now empty
        except OSError:
            pass  # leave it if something couldn't be moved

# ── Azure Speech ──────────────────────────────────────────────────────────────
SPEECH_KEY: str | None = os.getenv("AZURE_SPEECH_KEY")
SPEECH_REGION: str | None = os.getenv("AZURE_SPEECH_REGION")

# ── Azure OpenAI ──────────────────────────────────────────────────────────────
OPENAI_ENDPOINT: str | None = os.getenv("ENDPOINT_URL")
OPENAI_DEPLOYMENT: str | None = os.getenv("DEPLOYMENT_NAME")
OPENAI_API_KEY: str | None = (
    os.getenv("AZURE_OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY")
)
OPENAI_API_VERSION: str = os.getenv("API_VERSION", "2024-02-01")

# ── Server ────────────────────────────────────────────────────────────────────
PORT: int = int(os.getenv("PORT", 5000))
DEBUG: bool = os.getenv("FLASK_DEBUG", "false").lower() == "true"
# ── Basic Auth ────────────────────────────────────────────────────────────
# Set APP_AUTH_USER and APP_AUTH_PASS in .env to require login on every page load.
# Leave either blank to disable authentication (e.g. for local development).
APP_AUTH_USER: str | None = os.getenv("APP_AUTH_USER") or None
APP_AUTH_PASS: str | None = os.getenv("APP_AUTH_PASS") or None
# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
