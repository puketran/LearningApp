"""Azure OpenAI integration — exposes a single ``ask_ai()`` helper."""

import logging

from openai import AzureOpenAI

from ..config import (
    OPENAI_API_KEY,
    OPENAI_API_VERSION,
    OPENAI_DEPLOYMENT,
    OPENAI_ENDPOINT,
)

logger = logging.getLogger(__name__)

_client = AzureOpenAI(
    api_key=OPENAI_API_KEY,
    api_version=OPENAI_API_VERSION,
    azure_endpoint=OPENAI_ENDPOINT,
)

_JSON_SCHEMA_HINT = (
    "\nYou MUST respond with valid JSON only — no markdown, no extra text. "
    "The JSON must have these exact keys: "
    '"pronunciation", "vietnamese_meaning", "english_meaning", "examples"'
    " (array of 3 strings)."
)


def ask_ai(
    prompt: str,
    json_mode: bool = False,
    from_lang: str = "English",
    to_lang: str = "Vietnamese",
) -> str:
    """Send *prompt* to Azure OpenAI and return the raw response string.

    Args:
        prompt:    The user-facing prompt text.
        json_mode: When ``True`` the model is instructed to return JSON and the
                   ``response_format`` parameter is set accordingly.
        from_lang: Source language the user is studying.
        to_lang:   Target language for translations/explanations.

    Returns:
        The model's response string (may be JSON or plain text).

    Raises:
        openai.OpenAIError: On API-level failures.
    """
    system_content = (
        f"You are a helpful {from_lang}-{to_lang} language tutor. "
        f"The user is studying {from_lang} and wants explanations and "
        f"translations in {to_lang}. "
        "When a sentence context is provided, tailor the meanings to that "
        "specific usage."
    )
    if json_mode:
        system_content += _JSON_SCHEMA_HINT

    kwargs: dict = dict(
        model=OPENAI_DEPLOYMENT,
        messages=[
            {"role": "system", "content": system_content},
            {"role": "user", "content": prompt},
        ],
        temperature=1,
        max_completion_tokens=1000,
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    logger.debug("ask_ai prompt length=%d chars", len(prompt))
    response = _client.chat.completions.create(**kwargs)
    return response.choices[0].message.content
