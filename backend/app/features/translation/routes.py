from fastapi import APIRouter, Depends, Form, HTTPException, status, Request
from typing import Optional
from app.core.security import get_current_user
from models import TranslationRequest, TranslationResponse
from translation_service import translation_service


router = APIRouter(prefix="/api/translation", tags=["translation"])


@router.post("/translate", response_model=TranslationResponse)
async def translate_text(
    request: Request,
    current_user = Depends(get_current_user),
):
    input_text: Optional[str] = None
    target_lang: Optional[str] = None
    source_lang: Optional[str] = None

    # Try JSON first
    try:
        data = await request.json()
        if isinstance(data, dict):
            input_text = data.get("text")
            target_lang = data.get("target_language") or data.get("targetLanguage")
            source_lang = data.get("source_language") or data.get("sourceLanguage") or "auto"
    except Exception:
        data = None

    # If not JSON or missing required fields, try form
    if not input_text or not target_lang:
        try:
            form = await request.form()
            input_text = input_text or form.get("text")
            # accept both snake_case and camelCase for compatibility
            target_lang = target_lang or form.get("target_language") or form.get("targetLanguage")
            source_lang = source_lang or form.get("source_language") or form.get("sourceLanguage") or "auto"
        except Exception:
            pass

    if not input_text or not target_lang:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Missing required fields: 'text' and 'target_language'",
        )

    result = await translation_service.translate_text(
        input_text,
        target_lang,
        source_lang or "auto",
    )
    return result


