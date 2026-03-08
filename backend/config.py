"""
Application configuration.
All values are read from environment variables (via .env).
"""

import logging
import os
import shutil

from dotenv import load_dotenv

load_dotenv()

# ── Directory layout ──────────────────────────────────────────────────────────
# BASE_DIR is the project root (one level above backend/)
BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FRONTEND_DIR: str = os.path.join(BASE_DIR, "frontend")

# DATA_DIR: single parent folder for all user data.
# Set DATA_DIR in .env to an absolute path or a path relative to the project root.
# Defaults to <project_root>/data if not specified.
_raw_data_dir: str = os.getenv("DATA_DIR", "data")
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

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
