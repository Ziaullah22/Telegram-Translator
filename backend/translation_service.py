from googletrans import Translator
from typing import Optional
import logging

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
            result = await self.translator.translate(
                text,
                dest=target_language,
                src=source_language
            )

            return {
                "original_text": text,
                "translated_text": result.text,
                "source_language": result.src,
                "target_language": target_language
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
            return detection.lang
        except Exception as e:
            logger.error(f"Language detection error: {e}")
            return None

translation_service = TranslationService()
