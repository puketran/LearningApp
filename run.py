"""
Application entry point.

Run directly::

    python run.py

Or with a WSGI server::

    gunicorn run:app
"""

from backend.app import create_app
from backend.config import DEBUG, PORT

app = create_app()

if __name__ == "__main__":
    print(f"Server running at http://localhost:{PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=DEBUG)
