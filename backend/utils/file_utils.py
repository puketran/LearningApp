"""File and filename utility helpers shared across routes."""

import re


def sanitize_name(text: str, replacement: str = "_") -> str:
    """Strip unsafe characters and normalise whitespace for use in filenames.

    Returns at least ``"file"`` so callers never receive an empty string.
    """
    text = re.sub(r"[^\w\s-]", "", text).strip().lower()
    return re.sub(r"\s+", replacement, text) or "file"


def voice_slug(voice: str) -> str:
    """Convert an Azure voice name (e.g. ``en-US-AvaMultilingualNeural``)
    into a filesystem-safe segment (e.g. ``en_us_avamultilingualneural``).
    """
    return re.sub(r"[^\w]", "_", voice).lower()


def safe_id(value: str) -> str:
    """Keep only word characters and hyphens — suitable for IDs in paths."""
    return re.sub(r"[^\w-]", "", value)
