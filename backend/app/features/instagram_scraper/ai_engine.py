import aiohttp
import json
import logging
import asyncio
import re
from app.features.instagram_scraper.prompts import get_lead_analysis_prompt

logger = logging.getLogger(__name__)

class InstagramAIEngine:
    def __init__(self, ollama_url="http://localhost:11434"):
        self.ollama_url = ollama_url
        self.model = "gemma:2b"

    def _extract_json(self, text: str) -> dict:
        """Helper to find and parse JSON even if Gemma adds extra text."""
        try:
            # Find everything between { and }
            match = re.search(r'\{.*\}', text, re.DOTALL)
            if match:
                return json.loads(match.group(0))
            return json.loads(text)
        except:
            return {}

    async def analyze_lead_deep(self, lead_data: dict) -> dict:
        """
        Takes raw Instagram lead data and returns a structured AI analysis.
        """
        username = lead_data.get('username', 'unknown')
        bio = lead_data.get('bio', '').strip()
        followers = lead_data.get('followers', 0)

        # --- 🚀 MANUAL SIGNAL BOOST: Strong Business Signals ---
        business_keywords = ['catering', 'booking', 'dm for', 'dm to', 'partnership', 'founder', 'agency owner', 'click here']
        has_email = bool(re.search(r'[\w\.-]+@[\w\.-]+', bio))
        has_biz_keyword = any(kw in bio.lower() for kw in business_keywords)
        
        # --- QUICK SKIP: Don't waste AI on empty personal profiles ---
        if not bio and followers < 1000:
            return {
                "niche": "Personal",
                "intent_score": 0,
                "strategy": "No bio found. Likely a personal account.",
                "suggested_hook": "N/A",
                "quality": "low"
            }

        prompt = get_lead_analysis_prompt(username, bio, followers)
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.ollama_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False,
                        "format": "json"
                    },
                    timeout=30
                ) as response:
                    if response.status == 200:
                        res_json = await response.json()
                        raw_text = res_json.get('response', '{}')
                        result = self._extract_json(raw_text)
                        
                        # Apply Manual Boost if AI was too skeptical
                        if has_email or has_biz_keyword:
                            result['intent_score'] = max(result.get('intent_score', 0), 92)
                            if result.get('niche') == "Personal":
                                result['niche'] = "Business/Food"
                            result['strategy'] = f"✅ BUSINESS SIGNAL DETECTED. {result.get('strategy', '')}"
                            if not result.get('suggested_hook') or result.get('suggested_hook') == "N/A" or "one-line" in str(result.get('suggested_hook')).lower():
                                result['suggested_hook'] = f"Hey! I saw you handle catering/partnerships and wanted to reach out regarding a collaboration."
                        
                        logger.info(f"🧠 AI Analysis complete for @{username}")
                        return result
                    else:
                        logger.warning(f"⚠️ Ollama returned status {response.status}. Is it running?")
                        return {"error": "AI_OFFLINE"}
        except Exception as e:
            logger.error(f"❌ AI Analysis failed: {e}")
            return {"error": str(e)}

instagram_ai = InstagramAIEngine()
