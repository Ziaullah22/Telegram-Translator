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
        self.model = "gemma4" # 🧠 High-performance text analysis
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

    async def _call_llama_cpp(self, prompt: str, system_prompt: str = None) -> dict:
        """
        Attempts to call llama.cpp on port 8080 or 8000 using the OpenAI-compatible v1/chat/completions API.
        Falls back to Ollama with qwen2.5:32b if both fail.
        """
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": "qwen",
            "messages": messages,
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }

        for port in [8080, 8000]:
            url = f"http://localhost:{port}/v1/chat/completions"
            logger.info(f"Connecting to llama.cpp at {url}...")
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        url, 
                        json=payload, 
                        headers={"Content-Type": "application/json"}, 
                        timeout=aiohttp.ClientTimeout(connect=5, total=300)
                    ) as response:
                        if response.status == 200:
                            data = await response.json()
                            raw_content = data["choices"][0]["message"]["content"]
                            logger.info(f"Successfully got response from llama.cpp on port {port}")
                            return self._extract_json(raw_content)
                        else:
                            logger.warning(f"llama.cpp on port {port} returned status {response.status}")
            except Exception as e:
                logger.warning(f"Failed to connect to llama.cpp on port {port}: {e}")

        logger.info("llama.cpp not reachable. Falling back to Ollama qwen2.5:32b...")
        fallback_model = "qwen2.5:32b"
        full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    f"{self.ollama_url}/api/generate",
                    json={
                        "model": fallback_model,
                        "prompt": full_prompt,
                        "stream": False,
                        "options": {"temperature": 0.1}
                    },
                    timeout=aiohttp.ClientTimeout(connect=5, total=300)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        raw_content = data.get("response", "{}")
                        return self._extract_json(raw_content)
                    else:
                        logger.error(f"Ollama fallback error: {response.status}")
            except Exception as e:
                logger.error(f"Ollama fallback failed: {e}")
                
        return {}

    async def _init_transformers(self):
        """Lazy load Google's Gemma 4 to save memory when not in use."""
        if self.transformers_model is None:
            print(f"🚀 Loading Gemma 4 Engine ({self.model_id})...")
            from transformers import AutoProcessor, AutoModelForCausalLM
            import torch
            
            # Using the latest Gemma 4 model for multimodal tasks
            self.transformers_processor = AutoProcessor.from_pretrained(self.model_id)
            self.transformers_model = AutoModelForCausalLM.from_pretrained(
                self.model_id, 
                device_map="auto", 
                torch_dtype="auto"
            )
            print("✅ Gemma 4 Engine Ready!")

    async def analyze_vision_transformers(self, image_base64: str, niche_description: str) -> dict:
        """Analyze image using Gemma 4 (Native Multimodal Analysis)."""
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
            print(f"❌ [Gemma 4] Vision Error: {e}")
            return {"match": False, "confidence": 0, "reason": f"Gemma 4 Error: {str(e)}"}

    async def analyze_lead_deep(self, lead_data: dict, model_choice: str = None, intent_description: str = "", api_key: str = "") -> dict:
        """Analyze lead data using selected model in Ollama, MiniMax, Gemini, Groq, OpenRouter, or Hugging Face."""
        username = lead_data.get('username', 'unknown')
        bio = lead_data.get('bio', '').strip()
        followers = lead_data.get('followers', 0)

        # Quick check for non-leads
        if not bio and followers < 1000:
            return {"niche": "Personal", "intent_score": 0, "strategy": "Ignore.", "suggested_hook": "N/A", "quality": "low"}

        prompt = get_lead_analysis_prompt(username, bio, followers, intent_description)

        model_lower = model_choice.lower().strip() if model_choice else ""

        if model_lower == "qwen-35b-local":
            print(f"🧠 [Qwen 35B] Analyzing @{username} via llama.cpp/Ollama...")
            return await self._call_llama_cpp(prompt)

        elif model_lower.startswith("minimax"):
            if not api_key:
                return {"error": "MiniMax API key not provided"}
            
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": model_choice,
                "messages": [
                    {"role": "system", "content": "You are an expert lead qualification assistant. Analyze the Instagram profile info against the target intent and return JSON."},
                    {"role": "user", "content": prompt}
                ],
                "response_format": {"type": "json_object"}
            }
            
            async with aiohttp.ClientSession() as session:
                try:
                    async with session.post(
                        "https://api.minimax.chat/v1/chat/completions",
                        json=payload,
                        headers=headers,
                        timeout=30
                    ) as response:
                        if response.status != 200:
                            err_body = await response.text()
                            logger.error(f"❌ MiniMax API error {response.status}: {err_body}")
                            return {"error": f"MiniMax error: {response.status}"}
                        
                        data = await response.json()
                        raw_content = data["choices"][0]["message"]["content"]
                        return self._extract_json(raw_content)
                except Exception as e:
                    logger.error(f"❌ MiniMax request failed: {e}")
                    return {"error": f"Request failed: {str(e)}"}

        elif model_lower == "gemini":
            from app.core.config import settings
            if not settings.gemini_api_key:
                return {"error": "Gemini API key is missing from backend .env"}
            gemini_keys = [k.strip() for k in settings.gemini_api_key.split(",") if k.strip()]
            if not gemini_keys:
                return {"error": "Gemini API key is missing from backend .env"}
            last_err = ""
            for key in gemini_keys:
                gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key={key}"
                payload = {
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.1,
                        "responseMimeType": "application/json"
                    }
                }
                async with aiohttp.ClientSession() as session:
                    try:
                        async with session.post(gemini_url, json=payload, headers={"Content-Type": "application/json"}, timeout=30) as response:
                            if response.status == 200:
                                data = await response.json()
                                raw = data["candidates"][0]["content"]["parts"][0]["text"]
                                return self._extract_json(raw)
                            else:
                                last_err = f"Gemini status {response.status}"
                    except Exception as e:
                        last_err = str(e)
            return {"error": f"All Gemini keys failed. Last error: {last_err}"}

        elif model_lower == "groq":
            from app.core.config import settings
            if not settings.groq_api_key:
                return {"error": "Groq API key is missing from backend .env"}
            groq_keys = [k.strip() for k in settings.groq_api_key.split(",") if k.strip()]
            if not groq_keys:
                return {"error": "Groq API key is missing from backend .env"}
            last_err = ""
            for key in groq_keys:
                groq_url = "https://api.groq.com/openai/v1/chat/completions"
                payload = {
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"}
                }
                headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
                async with aiohttp.ClientSession() as session:
                    try:
                        async with session.post(groq_url, json=payload, headers=headers, timeout=30) as response:
                            if response.status == 200:
                                data = await response.json()
                                raw = data["choices"][0]["message"]["content"]
                                return self._extract_json(raw)
                            else:
                                last_err = f"Groq status {response.status}"
                    except Exception as e:
                        last_err = str(e)
            return {"error": f"All Groq keys failed. Last error: {last_err}"}

        elif model_lower == "openrouter":
            from app.core.config import settings
            if not settings.openrouter_api_key:
                return {"error": "OpenRouter API key is missing from backend .env"}
            or_keys = [k.strip() for k in settings.openrouter_api_key.split(",") if k.strip()]
            if not or_keys:
                return {"error": "OpenRouter API key is missing from backend .env"}
            last_err = ""
            for key in or_keys:
                or_url = "https://openrouter.ai/api/v1/chat/completions"
                payload = {
                    "model": "google/gemini-2.5-flash",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"}
                }
                headers = {
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:5173",
                    "X-Title": "Telegram Translator"
                }
                async with aiohttp.ClientSession() as session:
                    try:
                        async with session.post(or_url, json=payload, headers=headers, timeout=30) as response:
                            if response.status == 200:
                                data = await response.json()
                                raw = data["choices"][0]["message"]["content"]
                                return self._extract_json(raw)
                            else:
                                last_err = f"OpenRouter status {response.status}"
                    except Exception as e:
                        last_err = str(e)
            return {"error": f"All OpenRouter keys failed. Last error: {last_err}"}

        elif model_lower in ("huggingface", "hf"):
            from app.core.config import settings
            if not settings.huggingface_api_key:
                return {"error": "Hugging Face API key is missing from backend .env"}
            hf_keys = [k.strip() for k in settings.huggingface_api_key.split(",") if k.strip()]
            if not hf_keys:
                return {"error": "Hugging Face API key is missing from backend .env"}
            last_err = ""
            for key in hf_keys:
                hf_url = "https://router.huggingface.co/v1/chat/completions"
                payload = {
                    "model": "Qwen/Qwen2.5-72B-Instruct",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "max_tokens": 500
                }
                headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
                async with aiohttp.ClientSession() as session:
                    try:
                        async with session.post(hf_url, json=payload, headers=headers, timeout=30) as response:
                            if response.status == 200:
                                data = await response.json()
                                raw = data["choices"][0]["message"]["content"]
                                return self._extract_json(raw)
                            else:
                                last_err = f"Hugging Face status {response.status}"
                    except Exception as e:
                        last_err = str(e)
            return {"error": f"All Hugging Face keys failed. Last error: {last_err}"}

        else:
            # Local Ollama
            model_to_use = model_choice if model_choice and model_choice != "ollama-local" else self.model
            print(f"🧠 [{model_to_use}] Analyzing @{username} via Ollama...")
            
            async with aiohttp.ClientSession() as session:
                try:
                    async with session.post(
                        f"{self.ollama_url}/api/generate",
                        json={
                            "model": model_to_use,
                            "prompt": prompt,
                            "stream": False,
                            "options": {"temperature": 0.1}
                        },
                        timeout=180
                    ) as response:
                        if response.status != 200:
                            err_body = await response.text()
                            print(f"❌ [{model_to_use}] Ollama error {response.status}: {err_body}")
                            return {"error": f"Ollama error: {response.status}"}
                        
                        data = await response.json()
                        raw_content = data.get("response", "{}")
                        
                        # Log raw response for debugging
                        print(f"📡 [{model_to_use}] Raw Response: {raw_content[:200]}...")
                        
                        analysis = self._extract_json(raw_content)
                        if not analysis:
                            print(f"⚠️ [{model_to_use}] Failed to extract JSON from: {raw_content[:100]}")
                            return {"error": "JSON extraction failed"}
                            
                        print(f"✨ [{model_to_use}] Success! Score: {analysis.get('intent_score')}, Niche: {analysis.get('niche')}")
                        return analysis
                        
                except Exception as e:
                    err_msg = str(e) or type(e).__name__
                    print(f"❌ [{model_to_use}] Analysis error: {err_msg}")
                    return {"error": err_msg}

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

    async def analyze_google_result(self, title: str, url: str, snippet: str, criteria: str, model_choice: str = "minimax-text-01", api_key: str = "", ollama_url: str = None) -> dict:
        """
        Evaluate whether a Google Search Result matches the target lead criteria.
        Supports MiniMax 2.7 (cloud), Ollama (local), Gemini, Groq, OpenRouter, and Hugging Face.
        Implements a fallback chain: if the selected model fails, it tries other cloud models, then local ones.
        """
        system_prompt = (
            "You are an expert lead qualification assistant.\n"
            "Evaluate whether the following Google Search Result matches the user's target lead criteria.\n"
            "You MUST respond ONLY with a JSON object in this format:\n"
            "{\n"
            "  \"match\": true or false,\n"
            "  \"reason\": \"A brief explanation of why the result matches or does not match\"\n"
            "}"
        )
        
        user_prompt = (
            f"User Target Lead Criteria: \"{criteria}\"\n\n"
            "Google Search Result to evaluate:\n"
            f"- Title: {title}\n"
            f"- URL: {url}\n"
            f"- Description: {snippet}\n\n"
            "Is this result a match for the lead criteria?"
        )

        # Build fallback model list
        from app.core.config import settings
        
        candidates = []
        primary = model_choice.strip() if model_choice else "minimax-text-01"
        candidates.append(primary)
        
        # Cloud candidates
        if api_key and "minimax" not in primary.lower():
            candidates.append("minimax-text-01")
        if settings.gemini_api_key and primary.lower() != "gemini":
            candidates.append("gemini")
        if settings.groq_api_key and primary.lower() != "groq":
            candidates.append("groq")
        if settings.openrouter_api_key and primary.lower() != "openrouter":
            candidates.append("openrouter")
        if settings.huggingface_api_key and primary.lower() not in ("huggingface", "hf"):
            candidates.append("huggingface")
            
        # Local candidates
        if primary.lower() != "qwen-35b-local":
            candidates.append("qwen-35b-local")
        if primary.lower() != "ollama-local" and primary.lower() != "ollama":
            candidates.append("ollama-local")

        last_error = "No models attempted"
        
        for model in candidates:
            model_lower = model.lower().strip()
            logger.info(f"🧠 [AI Filter] Attempting Google Result Filter with model: {model}...")
            
            try:
                result = None
                if model_lower == "qwen-35b-local":
                    logger.info(f"🧠 [Qwen 35B] Filtering google result: {title} via llama.cpp/Ollama...")
                    result = await self._call_llama_cpp(user_prompt, system_prompt)
                    
                elif model_lower.startswith("minimax"):
                    if not api_key:
                        raise ValueError("MiniMax API key not provided")
                    
                    headers = {
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    }
                    payload = {
                        "model": model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        "response_format": {"type": "json_object"}
                    }
                    
                    async with aiohttp.ClientSession() as session:
                        async with session.post(
                            "https://api.minimax.chat/v1/chat/completions",
                            json=payload,
                            timeout=30
                        ) as response:
                            if response.status != 200:
                                err_body = await response.text()
                                raise ValueError(f"MiniMax API error {response.status}: {err_body}")
                            
                            data = await response.json()
                            raw_content = data["choices"][0]["message"]["content"]
                            result = self._extract_json(raw_content)
                            
                elif model_lower == "gemini":
                    if not settings.gemini_api_key:
                        raise ValueError("Gemini API key is missing")
                    gemini_keys = [k.strip() for k in settings.gemini_api_key.split(",") if k.strip()]
                    if not gemini_keys:
                        raise ValueError("Gemini API key list is empty")
                    last_gemini_err = ""
                    for key in gemini_keys:
                        gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key={key}"
                        payload = {
                            "contents": [{"role": "user", "parts": [{"text": f"{system_prompt}\n\n{user_prompt}"}]}],
                            "generationConfig": {
                                "temperature": 0.1,
                                "responseMimeType": "application/json"
                            }
                        }
                        try:
                            async with aiohttp.ClientSession() as session:
                                async with session.post(gemini_url, json=payload, headers={"Content-Type": "application/json"}, timeout=30) as response:
                                    if response.status == 200:
                                        data = await response.json()
                                        raw = data["candidates"][0]["content"]["parts"][0]["text"]
                                        result = self._extract_json(raw)
                                        break
                                    else:
                                        last_gemini_err = f"Gemini status {response.status}"
                        except Exception as e:
                            last_gemini_err = str(e)
                    else:
                        raise ValueError(f"All Gemini keys failed: {last_gemini_err}")
                            
                elif model_lower == "groq":
                    if not settings.groq_api_key:
                        raise ValueError("Groq API key is missing")
                    groq_keys = [k.strip() for k in settings.groq_api_key.split(",") if k.strip()]
                    if not groq_keys:
                        raise ValueError("Groq API key list is empty")
                    last_groq_err = ""
                    for key in groq_keys:
                        groq_url = "https://api.groq.com/openai/v1/chat/completions"
                        payload = {
                            "model": "llama-3.3-70b-versatile",
                            "messages": [
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": user_prompt}
                            ],
                            "temperature": 0.1,
                            "response_format": {"type": "json_object"}
                        }
                        headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
                        try:
                            async with aiohttp.ClientSession() as session:
                                async with session.post(groq_url, json=payload, headers=headers, timeout=30) as response:
                                    if response.status == 200:
                                        data = await response.json()
                                        raw = data["choices"][0]["message"]["content"]
                                        result = self._extract_json(raw)
                                        break
                                    else:
                                        last_groq_err = f"Groq status {response.status}"
                        except Exception as e:
                            last_groq_err = str(e)
                    else:
                        raise ValueError(f"All Groq keys failed: {last_groq_err}")
                            
                elif model_lower == "openrouter":
                    if not settings.openrouter_api_key:
                        raise ValueError("OpenRouter API key is missing")
                    or_keys = [k.strip() for k in settings.openrouter_api_key.split(",") if k.strip()]
                    if not or_keys:
                        raise ValueError("OpenRouter API key list is empty")
                    last_or_err = ""
                    for key in or_keys:
                        or_url = "https://openrouter.ai/api/v1/chat/completions"
                        payload = {
                            "model": "google/gemini-2.5-flash",
                            "messages": [
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": user_prompt}
                            ],
                            "temperature": 0.1,
                            "response_format": {"type": "json_object"}
                        }
                        headers = {
                            "Authorization": f"Bearer {key}",
                            "Content-Type": "application/json",
                            "HTTP-Referer": "http://localhost:5173",
                            "X-Title": "Telegram Translator"
                        }
                        try:
                            async with aiohttp.ClientSession() as session:
                                async with session.post(or_url, json=payload, headers=headers, timeout=30) as response:
                                    if response.status == 200:
                                        data = await response.json()
                                        raw = data["choices"][0]["message"]["content"]
                                        result = self._extract_json(raw)
                                        break
                                    else:
                                        last_or_err = f"OpenRouter status {response.status}"
                        except Exception as e:
                            last_or_err = str(e)
                    else:
                        raise ValueError(f"All OpenRouter keys failed: {last_or_err}")
                            
                elif model_lower in ("huggingface", "hf"):
                    if not settings.huggingface_api_key:
                        raise ValueError("Hugging Face API key is missing")
                    hf_keys = [k.strip() for k in settings.huggingface_api_key.split(",") if k.strip()]
                    if not hf_keys:
                        raise ValueError("Hugging Face API key list is empty")
                    last_hf_err = ""
                    for key in hf_keys:
                        hf_url = "https://router.huggingface.co/v1/chat/completions"
                        payload = {
                            "model": "Qwen/Qwen2.5-72B-Instruct",
                            "messages": [
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": user_prompt}
                            ],
                            "temperature": 0.1,
                            "max_tokens": 500
                        }
                        headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
                        try:
                            async with aiohttp.ClientSession() as session:
                                async with session.post(hf_url, json=payload, headers=headers, timeout=30) as response:
                                    if response.status == 200:
                                        data = await response.json()
                                        raw = data["choices"][0]["message"]["content"]
                                        result = self._extract_json(raw)
                                        break
                                    else:
                                        last_hf_err = f"Hugging Face status {response.status}"
                        except Exception as e:
                            last_hf_err = str(e)
                    else:
                        raise ValueError(f"All Hugging Face keys failed: {last_hf_err}")
                            
                else:
                    # Local Ollama fallback
                    url_to_use = ollama_url or self.ollama_url
                    model_to_use = model if model and model != "ollama-local" else self.model
                    prompt = f"{system_prompt}\n\n{user_prompt}"
                    
                    async with aiohttp.ClientSession() as session:
                        async with session.post(
                            f"{url_to_use}/api/generate",
                            json={
                                "model": model_to_use,
                                "prompt": prompt,
                                "stream": False,
                                "options": {"temperature": 0.1}
                            },
                            timeout=120
                        ) as response:
                            if response.status != 200:
                                err_body = await response.text()
                                raise ValueError(f"Ollama API error {response.status}: {err_body}")
                            
                            data = await response.json()
                            raw_content = data.get("response", "{}")
                            result = self._extract_json(raw_content)

                if result and isinstance(result, dict) and "match" in result and "error" not in result:
                    logger.info(f"✅ [AI Filter] Successfully qualified result using model: {model}")
                    return result
                else:
                    err_msg = result.get("error") if result else "JSON parsing or match key missing"
                    raise ValueError(err_msg)

            except Exception as e:
                last_error = f"{model} failed: {str(e)}"
                logger.warning(f"⚠️ [AI Filter] Model {model} failed. Trying fallback. Error: {last_error}")

        logger.error(f"❌ [AI Filter] All models failed in fallback chain. Last error: {last_error}")
        return {"match": False, "reason": f"All AI models failed. Last error: {last_error}"}

instagram_ai = InstagramAIEngine()
