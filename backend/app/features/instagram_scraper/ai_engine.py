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
            "temperature": 0.0,
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
                        "options": {"temperature": 0.0}
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

        if model_lower in ("qwen-35b-local", "qwen-14b-local", "qwen-7b-local", "llama-8b-local", "llama-3.1-8b-local"):
            print(f"🧠 [{model_choice}] Analyzing @{username} via llama.cpp/Ollama...")
            return await self._call_llama_cpp(prompt)

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
                        "temperature": 0.0,
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
                    "temperature": 0.0,
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
                    "temperature": 0.0,
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
                    "temperature": 0.0,
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
                            "options": {"temperature": 0.0}
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
                        "options": {"temperature": 0.0}
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

    async def analyze_leads_batch(self, leads: list, model_choice: str = None, intent_description: str = "", google_criteria: str = "", api_key: str = "") -> str:
        """
        Analyze a list of leads in a single prompt.
        Instructs the model to evaluate each lead and print the result in format:
        RESULT|LEAD_ID|MATCH_STATUS|INTENT_SCORE|NICHE|STRATEGY
        Returns the raw response text.
        """
        system_prompt = (
            "You are an expert lead qualification assistant.\n"
            "You will be given a list of leads (Instagram profiles and Google snippet data).\n"
            "You must analyze each lead fully and strictly against the custom Target Lead Criteria and custom Target Intent specified by the user.\n"
            "Do NOT use default generic rules (like requiring the lead to be a business owner or selling a service) unless explicitly specified in the criteria.\n"
            "Evaluate each lead based ONLY on whether its bio, content, title, or snippet aligns with the custom criteria/intent.\n"
            "For each lead, you MUST output exactly one line in this format:\n"
            "RESULT|LEAD_ID|MATCH_STATUS|INTENT_SCORE|NICHE|STRATEGY\n"
            "Where:\n"
            "- LEAD_ID: The numeric ID of the lead provided in the input.\n"
            "- MATCH_STATUS: 'true' if the lead meets the target criteria/intent, 'false' otherwise.\n"
            "- INTENT_SCORE: An integer from 0 to 100 indicating how well they match the target criteria/intent.\n"
            "- NICHE: A short one-word or two-word niche/category name.\n"
            "- STRATEGY: A grammatically complete, professional sentence explaining the precise reason why the lead qualifies or fails to qualify based on the target criteria/intent.\n\n"
            "CRITICAL RULES:\n"
            "1. You MUST process each lead independently. Do NOT compare leads, reference other lead IDs, or output placeholder/format correction text.\n"
            "2. Never output self-corrections or text like 'this result is replaced by...'. Every output line must be a valid analysis of the target lead ID.\n"
            "3. Do not output any intro, markdown formatting, backticks, json blocks, or explanation. Output ONLY the RESULT lines, one line per lead.\n\n"
            "Example output:\n"
            "RESULT|123|true|85|niche_name|The profile matches because the owner actively posts relevant content matching the criteria.\n"
            "RESULT|124|false|20|unrelated|This profile is rejected because it is completely unrelated to the target criteria."
        )

        if google_criteria and not intent_description:
            # Stage 1: Google vetting instructions
            system_prompt += (
                "\n\nADDITIONAL STAGE 1 GOOGLE VETTING INSTRUCTIONS:\n"
                "- Evaluate ONLY based on the Title, URL, and Google Snippet against the Target Lead Criteria.\n"
                "- A lead is a match if it directly and clearly relates to ANY of the concepts, products, or categories listed in the Target Lead Criteria (e.g., if criteria includes 'smoking' or 'smoke shops', then a 'tobacco shop' or 'cigar lounge' is a match; do not reject it for not mentioning 'vaping' or 'cannabis'). Note that this is only an example; you must apply this same matching logic dynamically to whatever concepts, products, or categories are listed in the user's specific Target Lead Criteria.\n"
                "- Reject (MATCH_STATUS = 'false') if the snippet context is vague, doubtful, or if keywords are used in a completely unrelated context.\n"
            )

        leads_str = ""
        for lead in leads:
            l_id = lead.get('id')
            username = lead.get('username')
            bio = lead.get('bio', '')
            followers = lead.get('followers', 0)
            google_data = lead.get('google_data', {})
            g_title = google_data.get('title', 'N/A')
            g_snippet = google_data.get('snippet', 'N/A')
            leads_str += (
                f"--- LEAD START ---\n"
                f"ID: {l_id}\n"
                f"Instagram Username: @{username}\n"
                f"Bio: {bio}\n"
                f"Followers: {followers}\n"
                f"Google Title: {g_title}\n"
                f"Google Snippet: {g_snippet}\n"
                f"--- LEAD END ---\n\n"
            )

        user_prompt = (
            f"Target Lead Criteria: \"{google_criteria}\"\n"
            f"Target Intent: \"{intent_description}\"\n\n"
            f"Leads to evaluate:\n{leads_str}"
            f"Analyze each lead and output exactly one line starting with RESULT| for each."
        )

        prompt = f"{system_prompt}\n\n{user_prompt}"
        model_lower = model_choice.lower().strip() if model_choice else ""
        from app.core.config import settings

        if model_lower == "gemini":
            if not settings.gemini_api_key:
                return "error: Gemini API key is missing from backend .env"
            gemini_keys = [k.strip() for k in settings.gemini_api_key.split(",") if k.strip()]
            if not gemini_keys:
                return "error: Gemini API key is missing from backend .env"
            last_err = ""
            for key in gemini_keys:
                gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key={key}"
                payload = {
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.0
                    }
                }
                async with aiohttp.ClientSession() as session:
                    try:
                        async with session.post(gemini_url, json=payload, headers={"Content-Type": "application/json"}, timeout=45) as response:
                            if response.status == 200:
                                data = await response.json()
                                return data["candidates"][0]["content"]["parts"][0]["text"]
                            else:
                                last_err = f"Gemini status {response.status}"
                    except Exception as e:
                        last_err = str(e)
            return f"error: All Gemini keys failed. Last error: {last_err}"

        elif model_lower == "groq":
            if not settings.groq_api_key:
                return "error: Groq API key is missing from backend .env"
            groq_keys = [k.strip() for k in settings.groq_api_key.split(",") if k.strip()]
            if not groq_keys:
                return "error: Groq API key is missing from backend .env"
            last_err = ""
            for key in groq_keys:
                groq_url = "https://api.groq.com/openai/v1/chat/completions"
                payload = {
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.0
                }
                headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
                async with aiohttp.ClientSession() as session:
                    try:
                        async with session.post(groq_url, json=payload, headers=headers, timeout=45) as response:
                            if response.status == 200:
                                data = await response.json()
                                return data["choices"][0]["message"]["content"]
                            else:
                                last_err = f"Groq status {response.status}"
                    except Exception as e:
                        last_err = str(e)
            return f"error: All Groq keys failed. Last error: {last_err}"

        elif model_lower == "openrouter":
            if not settings.openrouter_api_key:
                return "error: OpenRouter API key is missing from backend .env"
            or_keys = [k.strip() for k in settings.openrouter_api_key.split(",") if k.strip()]
            if not or_keys:
                return "error: OpenRouter API key is missing from backend .env"
            last_err = ""
            for key in or_keys:
                or_url = "https://openrouter.ai/api/v1/chat/completions"
                payload = {
                    "model": "google/gemini-2.5-flash",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.0
                }
                headers = {
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:5173",
                    "X-Title": "Telegram Translator"
                }
                async with aiohttp.ClientSession() as session:
                    try:
                        async with session.post(or_url, json=payload, headers=headers, timeout=45) as response:
                            if response.status == 200:
                                data = await response.json()
                                return data["choices"][0]["message"]["content"]
                            else:
                                last_err = f"OpenRouter status {response.status}"
                    except Exception as e:
                        last_err = str(e)
            return f"error: All OpenRouter keys failed. Last error: {last_err}"

        elif model_lower in ("huggingface", "hf"):
            if not settings.huggingface_api_key:
                return "error: Hugging Face API key is missing from backend .env"
            hf_keys = [k.strip() for k in settings.huggingface_api_key.split(",") if k.strip()]
            if not hf_keys:
                return "error: Hugging Face API key is missing from backend .env"
            last_err = ""
            for key in hf_keys:
                hf_url = "https://router.huggingface.co/v1/chat/completions"
                payload = {
                    "model": "Qwen/Qwen2.5-72B-Instruct",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.0,
                    "max_tokens": 1000
                }
                headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
                async with aiohttp.ClientSession() as session:
                    try:
                        async with session.post(hf_url, json=payload, headers=headers, timeout=45) as response:
                            if response.status == 200:
                                data = await response.json()
                                return data["choices"][0]["message"]["content"]
                            else:
                                last_err = f"Hugging Face status {response.status}"
                    except Exception as e:
                        last_err = str(e)
            return f"error: All Hugging Face keys failed. Last error: {last_err}"

        elif model_lower in ("qwen-35b-local", "qwen-14b-local", "qwen-7b-local", "llama-8b-local", "llama-3.1-8b-local"):
            # Call llama.cpp API on port 8080/8000
            payload = {
                "model": "qwen",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.0
            }
            for port in [8080, 8000]:
                url = f"http://localhost:{port}/v1/chat/completions"
                logger.info(f"Connecting to llama.cpp at {url} for batch...")
                try:
                    async with aiohttp.ClientSession() as session:
                        async with session.post(
                            url, 
                            json=payload, 
                            headers={"Content-Type": "application/json"}, 
                            timeout=240
                        ) as response:
                            if response.status == 200:
                                data = await response.json()
                                return data["choices"][0]["message"]["content"]
                            else:
                                logger.warning(f"llama.cpp on port {port} returned status {response.status}")
                except Exception as e:
                    logger.warning(f"Failed to connect to llama.cpp on port {port} for batch: {e}")
            
            return "error: llama.cpp not reachable on port 8080 or 8000"

        else:
            # Local Ollama
            model_to_use = model_choice if model_choice and model_choice != "ollama-local" else self.model
            async with aiohttp.ClientSession() as session:
                try:
                    async with session.post(
                        f"{self.ollama_url}/api/generate",
                        json={
                            "model": model_to_use,
                            "prompt": prompt,
                            "stream": False,
                            "options": {"temperature": 0.0}
                        },
                        timeout=240
                    ) as response:
                        if response.status != 200:
                            return f"error: Ollama error {response.status}"
                        data = await response.json()
                        return data.get("response", "")
                except Exception as e:
                    return f"error: {str(e)}"

    async def analyze_google_result(self, title: str, url: str, snippet: str, criteria: str, model_choice: str = "gemini", api_key: str = "", ollama_url: str = None) -> dict:
        """
        Evaluate whether a Google Search Result matches the target lead criteria.
        Supports Ollama (local), Gemini, Groq, OpenRouter, and Hugging Face.
        Implements a fallback chain: if the selected model fails, it tries other cloud models, then local ones.
        """
        system_prompt = (
            "You are a strict validator. Check if the Google Search Result matches the target lead criteria.\n"
            "RULES:\n"
            "1. You ONLY have: Title, URL, Google Description. Do NOT mention 'bio' or 'profile content'. Use 'Google description'.\n"
            "2. A result matches if it directly and clearly relates to ANY of the specific concepts, products, or categories listed in the target lead criteria. For example, if criteria includes 'smoking' or 'smoke shops', then a 'tobacco shop' or 'cigar store' is a match. Do not reject it for not mentioning 'cannabis' or 'vaping' if it matches the smoking criteria. Note that this is only an example; you must apply this same matching logic dynamically to whatever concepts, products, or categories are listed in the user's specific Target Lead Criteria.\n"
            "3. Reject (match=false) only if the description/title is vague, doubtful, or uses keywords in a completely unrelated context.\n"
            "4. Respond ONLY with a JSON object:\n"
            "{\n"
            "  \"match\": true or false,\n"
            "  \"reason\": \"A brief, direct sentence explaining why it matches or fails to match the target criteria.\"\n"
            "}"
        )
        
        user_prompt = (
            f"User Target Lead Criteria: \"{criteria}\"\n\n"
            "Google Search Result to evaluate:\n"
            f"- Title: {title}\n"
            f"- URL: {url}\n"
            f"- Google Description: {snippet}\n\n"
            "Is this result a match for the lead criteria?"
        )

        # Build fallback model list
        from app.core.config import settings
        
        candidates = []
        primary = model_choice.strip() if model_choice else "gemini"
        candidates.append(primary)
        
        # Cloud candidates
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
                if model_lower in ("qwen-35b-local", "qwen-14b-local", "qwen-7b-local", "llama-8b-local", "llama-3.1-8b-local"):
                    logger.info(f"🧠 [{model}] Filtering google result: {title} via llama.cpp/Ollama...")
                    result = await self._call_llama_cpp(user_prompt, system_prompt)
                    
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
                                "temperature": 0.0,
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
                            "temperature": 0.0,
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
                            "temperature": 0.0,
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
                            "temperature": 0.0,
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
                                "options": {"temperature": 0.0}
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
                    result["model_used"] = model
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
