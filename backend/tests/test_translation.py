import sys
import os
import pytest
from unittest.mock import MagicMock, AsyncMock

# Add the backend directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Mock deep_translator before importing translation_service
sys.modules['deep_translator'] = MagicMock()

from translation_service import TranslationService

@pytest.mark.asyncio
async def test_translation_logic_flow():
    """Test the translation service logic (mocking the external API)"""
    service = TranslationService()
    
    # Mock the internal translator to return an object with a .text and .src attribute
    mock_result = MagicMock()
    mock_result.text = "Hola Mundo"
    mock_result.src = "en"
    mock_result.dest = "es"
    service.translator.translate = MagicMock(return_value=mock_result)
    
    # Mock detection
    service.detect_language = AsyncMock(return_value="en")
    
    result = await service.translate_text("Hello World", "es")
    
    assert result['translated_text'] == "Hola Mundo"
    assert result['source_language'] == "en"
