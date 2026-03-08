"""
Application entry point.

Run directly::

    python run.py

Or with a WSGI server::

    gunicorn run:app
"""

import os
from backend.app import create_app

app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
