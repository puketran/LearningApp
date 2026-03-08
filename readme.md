# English Reading & Learning App

An AI-powered language learning tool built with Flask (Python) and vanilla JavaScript.
Add books, annotate sentences, build vocabulary, create mindmaps, and practise with
flashcards — all backed by Azure OpenAI and Azure Speech.

---

## Live Demo

| Environment             | URL                                   |
| ----------------------- | ------------------------------------- |
| **Production (Render)** | https://learningapp-e9x6.onrender.com |
| **Local**               | http://localhost:5000                 |

---

## Project Structure

```
Learning/
│
├── backend/                    # Python / Flask backend
│   ├── __init__.py
│   ├── app.py                  # Flask application factory (create_app)
│   ├── config.py               # All config values read from .env
│   │
│   ├── routes/                 # One Blueprint per feature domain
│   │   ├── __init__.py
│   │   ├── ai.py               # /api/explain, /api/translate, /api/ask, …
│   │   ├── books.py            # /api/books  (list / save / load / delete)
│   │   ├── tts.py              # /api/tts/*  and  /audios/<file>
│   │   ├── recordings.py       # /api/recordings/*  and  /recordings/<file>
│   │   └── images.py           # /api/images/*  and  /images/<file>
│   │
│   ├── services/               # Business / integration logic
│   │   ├── __init__.py
│   │   ├── ai_service.py       # Azure OpenAI wrapper  (ask_ai)
│   │   └── tts_service.py      # Azure Speech TTS      (synthesize)
│   │
│   └── utils/
│       ├── __init__.py
│       └── file_utils.py       # sanitize_name, voice_slug, safe_id helpers
│
├── frontend/                   # Browser-side assets
│   ├── index.html              # Single-page application shell
│   └── static/
│       └── views/
│           └── components/
│               ├── css/                     # Styles split by feature
│               │   ├── base.css             # CSS variables, reset, scrollbar
│               │   ├── sidebar.css          # Left sidebar & TOC tree
│               │   ├── content.css          # Main content area, sentences, detail panel
│               │   ├── flashcard.css        # Flashcard overlay & definition cards
│               │   ├── vocabs.css           # Vocab list overlay & buttons
│               │   ├── modals.css           # Modals & context menus
│               │   ├── responsive.css       # All @media breakpoints
│               │   ├── books.css            # Book list screen
│               │   ├── sections.css         # Section tabs, vocab cards, sentence filter
│               │   └── mindmap.css          # Mindmap overlay, nodes, side panel
│               └── js/                      # Logic split by feature
│                   ├── data.js              # Data model, localStorage, auto-save
│                   ├── toc.js               # TOC rendering & operations
│                   ├── sections.js          # Section selection & tab switching
│                   ├── sentences.js         # Sentence rendering & highlighting
│                   ├── vocabs.js            # Vocab management & vocab panel
│                   ├── audio.js             # TTS, sentence audio & voice recording
│                   ├── detail-panel.js      # Sentence/vocab detail side panel
│                   ├── ai.js                # AI search & translation helpers
│                   ├── books.js             # Book list, save/load/import/export
│                   ├── flashcard.js         # Flashcard review overlay
│                   ├── events.js            # Event listeners & app init
│                   └── mindmap.js           # Full mindmap engine (layout, render, drag)
│
├── books/                      # Saved book JSON files  (runtime data)
├── audios/                     # Generated TTS WAV files (runtime data)
├── recordings/                 # User voice recordings   (runtime data)
├── images/                     # Mindmap node images     (runtime data)
│
├── run.py                      # Entry point  →  python run.py
├── start.bat                   # Windows launcher (activates venv + runs run.py)
├── requirements.txt            # Python dependencies with version pins
├── .env                        # Secrets — NOT committed to source control
├── .env.example                # Template showing required variables
└── readme.md                   # This file
```

---

## Quick Start

### 1 — Clone / download & create a virtual environment

```bat
cd Learning
python -m venv venv
venv\Scripts\pip install -r requirements.txt
```

### 2 — Configure secrets

```bat
copy .env.example .env
```

Edit `.env` and fill in your Azure credentials:

| Variable               | Description                         |
| ---------------------- | ----------------------------------- |
| `ENDPOINT_URL`         | Azure OpenAI endpoint URL           |
| `DEPLOYMENT_NAME`      | GPT deployment name                 |
| `AZURE_OPENAI_API_KEY` | OpenAI API key                      |
| `API_VERSION`          | API version (default `2024-02-01`)  |
| `AZURE_SPEECH_KEY`     | Azure Speech resource key           |
| `AZURE_SPEECH_REGION`  | Azure Speech region (e.g. `eastus`) |
| `PORT`                 | HTTP port (default `5000`)          |
| `FLASK_DEBUG`          | `true` / `false` (default `false`)  |

### 3 — Run

```bat
start.bat          # Windows — double-click or run in terminal
# or
python run.py
```

Open `http://localhost:5000` in your browser.

---

## Architecture Overview

### Backend layers

| Layer           | Location            | Responsibility                                            |
| --------------- | ------------------- | --------------------------------------------------------- |
| **Entry point** | `run.py`            | Creates the app, starts the server                        |
| **App factory** | `backend/app.py`    | Wires blueprints together, configures Flask               |
| **Config**      | `backend/config.py` | Reads & exposes all env variables and directory paths     |
| **Routes**      | `backend/routes/`   | HTTP request handling, input validation, response shaping |
| **Services**    | `backend/services/` | External API calls (Azure OpenAI, Azure Speech)           |
| **Utils**       | `backend/utils/`    | Pure helpers with no Flask or Azure dependencies          |

### Frontend

The entire frontend is a **single-page application** served from `frontend/index.html`.

Styles and logic are split into focused files under `frontend/static/views/components/`:

| Layer   | Files                              | Responsibility                                                      |
| ------- | ---------------------------------- | ------------------------------------------------------------------- |
| **CSS** | `css/base.css` … `css/mindmap.css` | Ten feature-scoped stylesheets loaded in order                      |
| **JS**  | `js/data.js` … `js/mindmap.js`     | Twelve modules loaded as plain scripts; globals shared via `window` |

Load order in `index.html` mirrors dependency order (data → toc → sections → … → events → mindmap).

### API endpoints

| Method   | Path                         | Description                                             |
| -------- | ---------------------------- | ------------------------------------------------------- |
| `GET`    | `/health`                    | Health check (used by Render to confirm app is running) |
| `GET`    | `/api/books`                 | List all books for a user (`?user_id=`)                 |
| `GET`    | `/api/books/all`             | List every book in the folder (no user filter)          |
| `GET`    | `/api/books/file/<filename>` | Load a single book by filename (no user check)          |
| `POST`   | `/api/books/save`            | Save a book                                             |
| `POST`   | `/api/books/load`            | Load a book                                             |
| `POST`   | `/api/books/delete`          | Delete a book                                           |
| `GET`    | `/api/books/export/<file>`   | Download book + images as `.zip`                        |
| `POST`   | `/api/books/import`          | Import a `.zip` archive (book + images)                 |
| `POST`   | `/api/explain`               | Explain a word/phrase (AI)                              |
| `POST`   | `/api/translate`             | Translate a word/phrase (AI)                            |
| `POST`   | `/api/translate-sentence`    | Translate a sentence (AI)                               |
| `POST`   | `/api/ask`                   | Free-form AI question                                   |
| `POST`   | `/api/mindmap-translate`     | Short translation for mindmap nodes (AI)                |
| `POST`   | `/api/tts/generate`          | Generate word TTS audio                                 |
| `POST`   | `/api/tts/generate-sentence` | Generate sentence TTS audio                             |
| `POST`   | `/api/tts/check`             | Check if word audio is cached                           |
| `POST`   | `/api/tts/check-sentence`    | Check if sentence audio is cached                       |
| `POST`   | `/api/recordings/upload`     | Upload a voice recording                                |
| `POST`   | `/api/recordings/check`      | Check if recording exists                               |
| `POST`   | `/api/images/upload`         | Upload a mindmap node image                             |
| `POST`   | `/api/images/delete`         | Delete a mindmap node image                             |
| `GET`    | `/api/settings`              | Get current data folder config                          |
| `POST`   | `/api/settings`              | Update data folder path (local only)                    |
| `GET`    | `/api/status`                | Server uptime, disk usage, subfolder stats              |
| `GET`    | `/api/files`                 | Browse all files inside the configured data folder      |
| `GET`    | `/api/users`                 | List all users (id + name, no PIN)                      |
| `POST`   | `/api/users`                 | Create a new user (name + 4-digit PIN)                  |
| `POST`   | `/api/users/login`           | Verify PIN, returns `{ok, id, name}`                    |
| `DELETE` | `/api/users/<id>`            | Delete a user                                           |

---

## Deploying to Render

### 1 — Push to GitHub

Make sure `app_config.json` is in `.gitignore` (contains your local Windows path).

### 2 — Create a Web Service on Render

- Connect your GitHub repo
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** _(leave blank — Procfile handles it)_
- **Runtime:** Python 3.11

### 3 — Add Environment Variables (Render Dashboard → Environment)

| Variable               | Value                                   |
| ---------------------- | --------------------------------------- |
| `AZURE_OPENAI_API_KEY` | your key                                |
| `ENDPOINT_URL`         | your endpoint                           |
| `DEPLOYMENT_NAME`      | your deployment                         |
| `API_VERSION`          | `2024-12-01-preview`                    |
| `AZURE_SPEECH_KEY`     | your key                                |
| `AZURE_SPEECH_REGION`  | `eastus`                                |
| `APP_AUTH_USER`        | your login username                     |
| `APP_AUTH_PASS`        | your login password                     |
| `DATA_DIR`             | `/var/data` _(or your disk mount path)_ |

### 4 — Add a Persistent Disk (Render Pro — optional but recommended)

- Render Dashboard → your service → **Disks** → Add Disk
- **Mount Path:** `/var/data`
- Without a disk, all uploaded files (books, images, audio) are wiped on every restart

### 5 — Verify deployment

Visit these URLs after deploy:

```
https://learningapp-e9x6.onrender.com/health   → {"status": "ok"}
https://learningapp-e9x6.onrender.com/api/status → disk + folder stats
https://learningapp-e9x6.onrender.com/api/files  → file tree on disk
```

---

## Data Storage

| Data type          | Stored at                | Persists on Render?                          |
| ------------------ | ------------------------ | -------------------------------------------- |
| Book JSON          | `<DATA_DIR>/books/`      | ✅ with Render Disk / ❌ free tier           |
| Mindmap images     | `<DATA_DIR>/images/`     | ✅ with Render Disk / ❌ free tier           |
| TTS audio          | `<DATA_DIR>/audios/`     | ✅ with Render Disk / ❌ free tier           |
| Voice recordings   | `<DATA_DIR>/recordings/` | ✅ with Render Disk / ❌ free tier           |
| Users + PINs       | `<DATA_DIR>/users.json`  | ✅ with Render Disk / ❌ free tier           |
| Data folder config | `app_config.json`        | **Local only** — never deploy this file      |
| Azure credentials  | `.env`                   | **Local only** — use Render env vars instead |

> ⚠️ On Render's **free tier**, the container restarts after ~15 min of inactivity
> and all written files are wiped. Use **Render Disk** (Pro) for persistence.

---

## Legacy files

The original monolithic files at the project root (`server.py`, `index.html`,
`styles.css`, `app.js`) are kept for reference. They are **no longer used**
by `run.py` or `start.bat` and can be deleted once the refactored version is
verified to be working correctly.

> The previously monolithic `frontend/static/css/styles.css` and
> `frontend/static/js/app.js` have been removed and replaced by the component
> files under `frontend/static/views/components/`.
