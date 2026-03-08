"""AI / translation Blueprint — ``/api/explain``, ``/api/translate``, etc."""

import json
import logging

from flask import Blueprint, jsonify, request

from ..services.ai_service import ask_ai

logger = logging.getLogger(__name__)

ai_bp = Blueprint("ai", __name__, url_prefix="/api")


@ai_bp.route("/explain", methods=["POST"])
def explain_word():
    """Return structured JSON explaining a word/phrase in context."""
    data = request.get_json()
    word = data.get("word", "").strip()
    context_sentence = data.get("sentence", "").strip()
    from_lang = data.get("fromLang", "English").strip() or "English"
    to_lang = data.get("toLang", "Vietnamese").strip() or "Vietnamese"

    if not word:
        return jsonify({"error": "No word provided"}), 400

    prompt = f'Explain the {from_lang} word/phrase "{word}".'
    if context_sentence:
        prompt += f'\nIt appears in this sentence: "{context_sentence}"'
        prompt += (
            f"\nBase the {to_lang} and English meanings on how "
            "it is used in that sentence."
        )
    prompt += (
        f"\nRespond with JSON containing these keys:\n"
        f'- "pronunciation": IPA transcription of the word\n'
        f'- "vietnamese_meaning": {to_lang} translation fitting the context\n'
        f'- "english_meaning": English definition fitting the context\n'
        f'- "examples": array of exactly 3 example sentences using this word/phrase'
    )

    try:
        raw = ask_ai(prompt, json_mode=True, from_lang=from_lang, to_lang=to_lang)
        return jsonify({"result": json.loads(raw)})
    except json.JSONDecodeError:
        return jsonify({"result": raw})
    except Exception as exc:
        logger.exception("explain_word error")
        return jsonify({"error": str(exc)}), 500


@ai_bp.route("/translate", methods=["POST"])
def translate_word():
    """Translate a word/phrase to the specified target language."""
    data = request.get_json()
    word = data.get("word", "").strip()
    target_lang = data.get("targetLang", "Vietnamese") or "Vietnamese"
    from_lang = data.get("fromLang", "English").strip() or "English"

    if not word:
        return jsonify({"error": "No word provided"}), 400

    prompt = (
        f'Translate the {from_lang} word/phrase "{word}" to {target_lang}. '
        "Provide the translation and a brief explanation of usage."
    )

    try:
        return jsonify({"result": ask_ai(prompt, from_lang=from_lang, to_lang=target_lang)})
    except Exception as exc:
        logger.exception("translate_word error")
        return jsonify({"error": str(exc)}), 500


@ai_bp.route("/translate-sentence", methods=["POST"])
def translate_sentence():
    """Translate a full sentence and include grammar notes."""
    data = request.get_json()
    sentence = data.get("sentence", "").strip()
    from_lang = data.get("fromLang", "English").strip() or "English"
    to_lang = data.get("toLang", "Vietnamese").strip() or "Vietnamese"

    if not sentence:
        return jsonify({"error": "No sentence provided"}), 400

    prompt = (
        f'Translate this {from_lang} sentence to {to_lang}:\n"{sentence}"\n\n'
        f"Respond with JSON containing these keys:\n"
        f'- "translation": the {to_lang} translation\n'
        f'- "notes": brief grammar or usage notes (1–2 sentences, in English)'
    )

    try:
        raw = ask_ai(prompt, json_mode=True, from_lang=from_lang, to_lang=to_lang)
        return jsonify({"result": json.loads(raw)})
    except json.JSONDecodeError:
        return jsonify({"result": {"translation": raw, "notes": ""}})
    except Exception as exc:
        logger.exception("translate_sentence error")
        return jsonify({"error": str(exc)}), 500


@ai_bp.route("/ask", methods=["POST"])
def ask_general():
    """Answer a free-form language-learning question."""
    data = request.get_json()
    question = data.get("question", "").strip()

    if not question:
        return jsonify({"error": "No question provided"}), 400

    try:
        return jsonify({"result": ask_ai(question)})
    except Exception as exc:
        logger.exception("ask_general error")
        return jsonify({"error": str(exc)}), 500


@ai_bp.route("/mindmap-translate", methods=["POST"])
def mindmap_translate():
    """Return a concise translation/description for a mindmap node."""
    data = request.get_json()
    word = data.get("word", "").strip()
    from_lang = data.get("fromLang", "English").strip() or "English"
    to_lang = data.get("toLang", "Vietnamese").strip() or "Vietnamese"

    if not word:
        return jsonify({"error": "No word provided"}), 400

    prompt = (
        f'Translate or briefly describe the {from_lang} word/phrase '
        f'"{word}" in {to_lang}. '
        f"Provide only the {to_lang} translation or a very short description "
        f"(max 8 words). No extra explanation, just the {to_lang} text."
    )

    try:
        result = ask_ai(prompt, from_lang=from_lang, to_lang=to_lang)
        return jsonify({"result": result.strip().strip('"').strip("'")})
    except Exception as exc:
        logger.exception("mindmap_translate error")
        return jsonify({"error": str(exc)}), 500
