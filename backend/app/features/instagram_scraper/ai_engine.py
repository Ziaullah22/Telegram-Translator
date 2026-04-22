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
        self.model = "gemma4:e2b" # 🧠 High-performance text analysis
        self.vision_model = "gemma4:e2b" # 👁️ Native Vision capability
        self.vision_engine_type = "ollama" 
        self.transformers_model = None
        self.transformers_processor = None

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

    async def _init_transformers(self):
        """Lazy load Google's Gemma 4 E2B to save memory when not in use."""
        if self.transformers_model is None:
            print(f"🚀 Loading Gemma 4 E2B Engine ({self.model_id})...")
            from transformers import AutoProcessor, AutoModelForCausalLM
            import torch
            
            # Using the latest Gemma 4 Effective 2B model for multimodal tasks
            self.transformers_processor = AutoProcessor.from_pretrained(self.model_id)
            self.transformers_model = AutoModelForCausalLM.from_pretrained(
                self.model_id, 
                device_map="auto", 
                torch_dtype="auto"
            )
            print("✅ Gemma 4 E2B Engine Ready!")

    async def analyze_vision_transformers(self, image_base64: str, niche_description: str) -> dict:
        """Analyze image using Gemma 4 E2B (Native Multimodal Analysis)."""
        try:
            await self._init_transformers()
            from PIL import Image
            import io
            import base64
            
            # Decode image
            image_data = base64.b64decode(image_base64)
            image = Image.open(io.BytesIO(image_data))
            
            # Prepare prompt using the standard Gemma 4 format
            prompt = f"Analyze this image. Does it contain elements related to {niche_description}? Answer in JSON format: {{\"match\": true/false, \"reason\": \"explanation\"}}"
            
            # Process and generate
            inputs = self.transformers_processor(text=prompt, images=image, return_tensors="pt").to(self.transformers_model.device)
            
            import torch
            with torch.no_grad():
                generated_ids = self.transformers_model.generate(**inputs, max_new_tokens=200)
            
            response_text = self.transformers_processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
            
            # Extract JSON from the multimodal response
            analysis = self._extract_json(response_text)
            
            return {
                "match": analysis.get("match", False),
                "confidence": 0.95 if analysis.get("match") else 0.05,
                "reason": analysis.get("reason", response_text)
            }
        except Exception as e:
            print(f"❌ [Gemma 4 E2B] Vision Error: {e}")
            return {"match": False, "confidence": 0, "reason": f"Gemma 4 Error: {str(e)}"}

    async def analyze_lead_deep(self, lead_data: dict) -> dict:
        """Analyze lead data using Gemma 4 E2B in Ollama."""
        username = lead_data.get('username', 'unknown')
        bio = lead_data.get('bio', '').strip()
        followers = lead_data.get('followers', 0)

        # Quick check for non-leads
        if not bio and followers < 1000:
            return {"niche": "Personal", "intent_score": 0, "strategy": "Ignore.", "suggested_hook": "N/A"}

        print(f"🧠 [Gemma 4 E2B] Analyzing @{username} via Ollama...")
        prompt = get_lead_analysis_prompt(username, bio, followers)
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    f"{self.ollama_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False,
                        "options": {"temperature": 0.1}
                    },
                    timeout=60
                ) as response:
                    if response.status != 200:
                        err_body = await response.text()
                        print(f"❌ [Gemma 4 E2B] Ollama error {response.status}: {err_body}")
                        return {"error": f"Ollama error: {response.status}"}
                    
                    data = await response.json()
                    raw_content = data.get("response", "{}")
                    
                    # Log raw response for debugging
                    print(f"📡 [Gemma 4 E2B] Raw Response: {raw_content[:200]}...")
                    
                    analysis = self._extract_json(raw_content)
                    if not analysis:
                        print(f"⚠️ [Gemma 4 E2B] Failed to extract JSON from: {raw_content[:100]}")
                        return {"error": "JSON extraction failed"}
                        
                    print(f"✨ [Gemma 4 E2B] Success! Score: {analysis.get('intent_score')}, Niche: {analysis.get('niche')}")
                    return analysis
                    
            except Exception as e:
                print(f"❌ [Gemma 4 E2B] Analysis error: {e}")
                return {"error": str(e)}

    async def analyze_vision(self, image_base64: str, niche_description: str) -> dict:
        """Analyze image using the best available engine."""
        if self.vision_engine_type == "transformers":
            return await self.analyze_vision_transformers(image_base64, niche_description)
            
        # Fallback to Ollama
        prompt = f"""
        Analyze this image. Does it contain elements related to: "{niche_description}"?
        
        Respond ONLY in JSON format:
        {{
            "match": true/false,
            "confidence": 0-1,
            "reason": "Brief explanation of what you see"
        }}
        """
        
        print(f"🧠 [Vision] Sending request to Ollama (Model: {self.vision_model})...")
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    f"{self.ollama_url}/api/generate",
                    json={
                        "model": self.vision_model,
                        "prompt": prompt,
                        "images": [image_base64],
                        "stream": False,
                        "options": {"temperature": 0}
                    },
                    timeout=120
                ) as response:
                    if response.status != 200:
                        err_text = await response.text()
                        is_oom = "resource limitations" in err_text or "model runner" in err_text
                        print(f"❌ [LLaVA] Ollama error ({response.status}): {err_text}")
                        reason = "Ollama Hardware/Memory Exhausted. Restart Ollama or close other apps." if is_oom else "AI Service Error"
                        return {"match": False, "confidence": 0, "reason": reason}
                    
                    data = await response.json()
                    raw_content = data.get("response", "{}")
                    return self._extract_json(raw_content)
            except Exception as e:
                print(f"❌ [Ollama] Vision error: {e}")
                return {"match": False, "confidence": 0, "reason": "Connection Error"}

instagram_ai = InstagramAIEngine()
