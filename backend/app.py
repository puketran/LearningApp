"""Flask application factory.

Usage::

    from backend.app import create_app
    app = create_app()
"""

import logging
import os

from flask import Flask, send_from_directory
from flask_cors import CORS

logger = logging.getLogger(__name__)


def create_app() -> Flask:
    """Construct, configure, and return the Flask application.

    All routes are registered via Blueprints. Static assets are served from
    ``frontend/static/`` and the SPA entry point from ``frontend/index.html``.
    """
    # Import here so config's load_dotenv() runs before the package is used.
    from .config import FRONTEND_DIR
    from .routes.ai import ai_bp
    from .routes.books import books_bp
    from .routes.images import images_bp
    from .routes.recordings import recordings_bp
    from .routes.settings import settings_bp
    from .routes.tts import tts_bp

    app = Flask(
        __name__,
        static_folder=os.path.join(FRONTEND_DIR, "static"),
        static_url_path="/static",
    )
    CORS(app)

    # ── Register feature blueprints ──────────────────────────────────────────
    app.register_blueprint(ai_bp)           # /api/explain, /api/translate, …
    app.register_blueprint(books_bp)        # /api/books/*
    app.register_blueprint(tts_bp)          # /api/tts/*, /audios/<file>
    app.register_blueprint(recordings_bp)   # /api/recordings/*, /recordings/<file>
    app.register_blueprint(images_bp)       # /api/images/*, /images/<file>
    app.register_blueprint(settings_bp)     # /api/settings

    # ── SPA catch-all — serve index.html ────────────────────────────────────
    @app.route("/")
    def serve_index():
        return send_from_directory(FRONTEND_DIR, "index.html")

    logger.info("Flask app created — blueprints registered")
    return app
