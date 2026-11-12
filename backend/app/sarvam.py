"""Sarvam AI Speech Services Client.

Provides Speech-to-Text (STT) and Text-to-Speech (TTS) integration using
official Sarvam AI REST APIs for English, Tamil, and code-mixed speech.
"""

import logging
import os
from typing import Any, Dict, Optional, Tuple
import httpx

logger = logging.getLogger("retailiq.sarvam")

SARVAM_BASE_URL = os.getenv("SARVAM_BASE_URL", "https://api.sarvam.ai").rstrip("/")
DEFAULT_STT_MODEL = os.getenv("SARVAM_MODEL_STT", "saaras:v4")
DEFAULT_TTS_MODEL = os.getenv("SARVAM_MODEL_TTS", "bulbul:v3")
DEFAULT_TIMEOUT_SECONDS = float(os.getenv("SARVAM_TIMEOUT", "30.0"))


def get_sarvam_api_key() -> Optional[str]:
    """Retrieve the Sarvam AI API subscription key from environment variables."""
    key = os.getenv("SARVAM_API_KEY", "").strip()
    return key if key else None


def is_sarvam_configured() -> bool:
    """Return True if a Sarvam AI API key is configured."""
    return get_sarvam_api_key() is not None


def map_language_to_bcp47(language: str) -> str:
    """Map RetailIQ language representation to BCP-47 language codes."""
    lang = (language or "").strip().lower()
    if lang in ("tamil", "ta", "ta-in"):
        return "ta-IN"
    if lang in ("tanglish", "tamil-english", "code-mixed"):
        return "ta-IN"
    return "en-IN"


def pick_default_speaker(language_code: str) -> str:
    """Select a natural voice persona for the target language."""
    if language_code == "ta-IN":
        return "kavitha"
    return "priya"


async def speech_to_text(
    audio_bytes: bytes,
    filename: str = "audio.wav",
    content_type: str = "audio/wav",
    language_code: Optional[str] = None,
    mode: str = "codemix",
) -> Dict[str, Any]:
    """Transcribe spoken audio using Sarvam Saaras Speech-to-Text API.

    Returns a dict with:
        - transcript: str
        - language_code: str (detected)
        - success: bool
        - error: Optional[str]
    """
    api_key = get_sarvam_api_key()
    if not api_key:
        return {
            "success": False,
            "configured": False,
            "transcript": "",
            "error": "SARVAM_API_KEY is not configured on the backend.",
        }

    headers = {
        "api-subscription-key": api_key,
    }
    files = {
        "file": (filename, audio_bytes, content_type or "audio/wav"),
    }
    data = {
        "model": DEFAULT_STT_MODEL,
        "mode": mode or "codemix",
    }
    if language_code and language_code != "unknown":
        data["language_code"] = language_code
    else:
        data["language_code"] = "unknown"

    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{SARVAM_BASE_URL}/speech-to-text",
                headers=headers,
                files=files,
                data=data,
            )

        if response.status_code != 200:
            logger.warning(
                "Sarvam STT failed with status %s: %s",
                response.status_code,
                response.text,
            )
            return {
                "success": False,
                "configured": True,
                "transcript": "",
                "status_code": response.status_code,
                "error": f"Sarvam speech service error ({response.status_code}). Please try again.",
            }

        payload = response.json()
        transcript = payload.get("transcript", "").strip()
        detected_lang = payload.get("language_code", "")
        return {
            "success": True,
            "configured": True,
            "transcript": transcript,
            "language_code": detected_lang,
            "request_id": payload.get("request_id"),
        }
    except httpx.TimeoutException:
        logger.error("Sarvam STT request timed out")
        return {
            "success": False,
            "configured": True,
            "transcript": "",
            "error": "Sarvam speech service timed out. Please try speaking again.",
        }
    except Exception as exc:
        logger.error("Sarvam STT request exception: %s", exc)
        return {
            "success": False,
            "configured": True,
            "transcript": "",
            "error": f"Failed to connect to speech recognition service: {exc}",
        }


async def text_to_speech(
    text: str,
    language: str = "English",
    speaker: Optional[str] = None,
    pace: float = 1.0,
) -> Dict[str, Any]:
    """Synthesize speech using Sarvam Bulbul Text-to-Speech API.

    Returns a dict with:
        - audio_base64: str
        - format: str
        - success: bool
        - error: Optional[str]
    """
    api_key = get_sarvam_api_key()
    if not api_key:
        return {
            "success": False,
            "configured": False,
            "audio_base64": None,
            "error": "SARVAM_API_KEY is not configured on the backend.",
        }

    clean_text = (text or "").strip()
    if not clean_text:
        return {
            "success": False,
            "configured": True,
            "audio_base64": None,
            "error": "Text is empty.",
        }

    # Bulbul supports up to 2500 characters
    truncated_text = clean_text[:2400]
    lang_code = map_language_to_bcp47(language)
    voice_speaker = speaker or pick_default_speaker(lang_code)

    headers = {
        "api-subscription-key": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "text": truncated_text,
        "language_code": lang_code,
        "speaker": voice_speaker,
        "model": DEFAULT_TTS_MODEL,
        "pace": max(0.5, min(2.0, float(pace))),
        "speech_sample_rate": 24000,
        "output_audio_codec": "mp3",
    }

    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{SARVAM_BASE_URL}/text-to-speech",
                headers=headers,
                json=payload,
            )

        if response.status_code != 200:
            logger.warning(
                "Sarvam TTS failed with status %s: %s",
                response.status_code,
                response.text,
            )
            return {
                "success": False,
                "configured": True,
                "audio_base64": None,
                "status_code": response.status_code,
                "error": f"Sarvam voice service error ({response.status_code}).",
            }

        data = response.json()
        audios = data.get("audios") or []
        audio_base64 = audios[0] if audios else None
        if not audio_base64:
            return {
                "success": False,
                "configured": True,
                "audio_base64": None,
                "error": "No audio returned from voice synthesis.",
            }

        return {
            "success": True,
            "configured": True,
            "audio_base64": audio_base64,
            "format": "audio/mp3",
            "language_code": lang_code,
            "speaker": voice_speaker,
        }
    except httpx.TimeoutException:
        logger.error("Sarvam TTS request timed out")
        return {
            "success": False,
            "configured": True,
            "audio_base64": None,
            "error": "Voice synthesis request timed out.",
        }
    except Exception as exc:
        logger.error("Sarvam TTS request exception: %s", exc)
        return {
            "success": False,
            "configured": True,
            "audio_base64": None,
            "error": f"Failed to generate voice response: {exc}",
        }
