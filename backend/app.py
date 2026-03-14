"""Flask application factory.

Usage::

    from backend.app import create_app
    app = create_app()
"""

import base64
import logging
import os

from flask import Flask, Response, request, send_from_directory
from flask_cors import CORS

logger = logging.getLogger(__name__)


def create_app() -> Flask:
    """Construct, configure, and return the Flask application.

    All routes are registered via Blueprints. Static assets are served from
    ``frontend/static/`` and the SPA entry point from ``frontend/index.html``.
    """
    # Import here so config's load_dotenv() runs before the package is used.
    from .config import APP_AUTH_PASS, APP_AUTH_USER, FRONTEND_DIR
    from .routes.ai import ai_bp
    from .routes.books import books_bp
    from .routes.images import images_bp
    from .routes.mindmap import mindmap_bp
    from .routes.recordings import recordings_bp
    from .routes.settings import settings_bp
    from .routes.tts import tts_bp
    from .routes.users import users_bp

    app = Flask(
        __name__,
        static_folder=os.path.join(FRONTEND_DIR, "static"),
        static_url_path="/static",
    )
    CORS(app)

    # ── Basic Auth gate ────────────────────────────────────────────────────
    if APP_AUTH_USER and APP_AUTH_PASS:
        _expected = base64.b64encode(
            f"{APP_AUTH_USER}:{APP_AUTH_PASS}".encode()
        ).decode()

        @app.before_request
        def require_auth():
            # Always let the health check through (Render probes need it)
            if request.path == "/health":
                return None
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Basic "):
                provided = auth_header[6:]
                if provided == _expected:
                    return None
            return Response(
                "Authentication required",
                401,
                {"WWW-Authenticate": 'Basic realm="LearningApp"'},
            )

        logger.info("Basic auth enabled (user: %s)", APP_AUTH_USER)
    else:
        logger.info("Basic auth disabled — set APP_AUTH_USER and APP_AUTH_PASS in .env to enable")

    # ── Register feature blueprints ──────────────────────────────────────────
    app.register_blueprint(ai_bp)           # /api/explain, /api/translate, …
    app.register_blueprint(books_bp)        # /api/books/*
    app.register_blueprint(mindmap_bp)      # /api/mindmap/*  (undo checkpoints)
    app.register_blueprint(tts_bp)          # /api/tts/*, /audios/<file>
    app.register_blueprint(recordings_bp)   # /api/recordings/*, /recordings/<file>
    app.register_blueprint(images_bp)       # /api/images/*, /images/<file>
    app.register_blueprint(settings_bp)     # /api/settings
    app.register_blueprint(users_bp)        # /api/users/*

    # ── Health check — required by Render and other platforms ────────────────
    @app.route("/health")
    def health():
        from flask import jsonify
        return jsonify({"status": "ok"})

    # ── SPA catch-all — serve index.html ────────────────────────────────────
    @app.route("/")
    def serve_index():
        return send_from_directory(FRONTEND_DIR, "index.html")

    logger.info("Flask app created — blueprints registered")
    return app
