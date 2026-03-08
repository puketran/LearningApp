"""Azure Cognitive Services Speech — TTS synthesis helpers."""

import logging
import os

import azure.cognitiveservices.speech as speechsdk

from ..config import SPEECH_KEY, SPEECH_REGION

logger = logging.getLogger(__name__)


def synthesize(text: str, voice: str, output_path: str) -> dict:
    """Synthesise *text* with *voice* and write a WAV file to *output_path*.

    Returns a dict with ``{"success": True}`` on success, or
    ``{"error": "<message>"}`` on failure. Partial output files are removed
    automatically on error.
    """
    if not SPEECH_KEY or not SPEECH_REGION:
        return {"error": "Azure Speech Service not configured"}

    try:
        speech_config = speechsdk.SpeechConfig(
            subscription=SPEECH_KEY, region=SPEECH_REGION
        )
        speech_config.speech_synthesis_voice_name = voice
        audio_config = speechsdk.audio.AudioOutputConfig(filename=output_path)
        synthesizer = speechsdk.SpeechSynthesizer(
            speech_config=speech_config, audio_config=audio_config
        )

        result = synthesizer.speak_text_async(text).get()

        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            logger.info(
                "TTS OK: %r → %s", text[:40], os.path.basename(output_path)
            )
            return {"success": True}

        if result.reason == speechsdk.ResultReason.Canceled:
            details = result.cancellation_details
            return {"error": f"Speech synthesis canceled: {details.reason}"}

        return {"error": "Speech synthesis failed"}

    except Exception as exc:  # pylint: disable=broad-except
        if os.path.isfile(output_path):
            os.remove(output_path)
        logger.exception("TTS synthesis error: %s", exc)
        return {"error": str(exc)}
