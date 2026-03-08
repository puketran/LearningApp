# English Reading & Learning App

An AI-powered language learning tool built with Flask (Python) and vanilla JavaScript.
Add books, annotate sentences, build vocabulary, create mindmaps, and practise with
flashcards — all backed by Azure OpenAI and Azure Speech.

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

| Method | Path                         | Description                              |
| ------ | ---------------------------- | ---------------------------------------- |
| `GET`  | `/api/books`                 | List all books                           |
| `POST` | `/api/books/save`            | Save a book                              |
| `POST` | `/api/books/load`            | Load a book                              |
| `POST` | `/api/books/delete`          | Delete a book                            |
| `GET`  | `/api/books/export/<file>`   | Download book + images as `.zip`         |
| `POST` | `/api/books/import`          | Import a `.zip` archive (book + images)  |
| `POST` | `/api/explain`               | Explain a word/phrase (AI)               |
| `POST` | `/api/translate`             | Translate a word/phrase (AI)             |
| `POST` | `/api/translate-sentence`    | Translate a sentence (AI)                |
| `POST` | `/api/ask`                   | Free-form AI question                    |
| `POST` | `/api/mindmap-translate`     | Short translation for mindmap nodes (AI) |
| `POST` | `/api/tts/generate`          | Generate word TTS audio                  |
| `POST` | `/api/tts/generate-sentence` | Generate sentence TTS audio              |
| `POST` | `/api/tts/check`             | Check if word audio is cached            |
| `POST` | `/api/tts/check-sentence`    | Check if sentence audio is cached        |
| `POST` | `/api/recordings/upload`     | Upload a voice recording                 |
| `POST` | `/api/recordings/check`      | Check if recording exists                |
| `POST` | `/api/images/upload`         | Upload a mindmap node image              |
| `POST` | `/api/images/delete`         | Delete a mindmap node image              |

---

## Legacy files

The original monolithic files at the project root (`server.py`, `index.html`,
`styles.css`, `app.js`) are kept for reference. They are **no longer used**
by `run.py` or `start.bat` and can be deleted once the refactored version is
verified to be working correctly.

> The previously monolithic `frontend/static/css/styles.css` and
> `frontend/static/js/app.js` have been removed and replaced by the component
> files under `frontend/static/views/components/`.
