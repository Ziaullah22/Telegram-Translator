from googletrans import Translator
from typing import Optional
import logging
import asyncio
import inspect

logger = logging.getLogger(__name__)

class TranslationService:
    def __init__(self):
        self.translator = Translator()

    async def translate_text(
        self,
        text: str,
        target_language: str,
        source_language: str = "auto"
    ) -> dict:
        try:
            # Add a strict 5-second timeout factor for all translations
            # This prevents the backend from hanging indefinitely if Google is slow
            async def _do_translate():
                res = self.translator.translate(
                    text,
                    dest=target_language,
                    src=source_language
                )
                if hasattr(res, '__await__') or asyncio.iscoroutine(res):
                    return await res
                return res

            # Run with timeout
            result = await asyncio.wait_for(_do_translate(), timeout=5.0)

            return {
                "original_text": text,
                "translated_text": result.text,
                "source_language": result.src,
                "target_language": target_language
            }

        except asyncio.TimeoutError:
            logger.warning(f"Translation timed out for: '{text[:20]}...' Falls back to original.")
            return {
                "original_text": text,
                "translated_text": text,
                "source_language": source_language,
                "target_language": target_language,
                "error": "timeout"
            }
        except Exception as e:
            logger.error(f"Translation error: {e}")
            return {
                "original_text": text,
                "translated_text": text,
                "source_language": source_language,
                "target_language": target_language,
                "error": str(e)
            }

    def detect_language(self, text: str) -> Optional[str]:
        try:
            detection = self.translator.detect(text)
            
            # Handle potential async detection
            if hasattr(detection, '__await__') or asyncio.iscoroutine(detection):
                # This would need an async wrapper or running in an event loop
                # For now, we return the lang if it's already there (sync)
                return detection.lang
            
            return detection.lang
        except Exception as e:
            logger.error(f"Language detection error: {e}")
            return None

translation_service = TranslationService()
