from fastapi import APIRouter, Depends, Query, HTTPException, BackgroundTasks, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
from models import TokenData, InstagramDiscoveryRequest, InstagramProxyCreate, InstagramAccountCreate
from auth import get_current_user
from instagram_service import instagram_service
from .session_manager import instagram_session_manager

router = APIRouter(prefix="/api/instagram", tags=["instagram"])

@router.post("/accounts/{account_id}/connect")
async def connect_account(
    account_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """Launch a browser for the account. It starts minimized and logs in automatically."""
    from database import db
    account = await db.fetchrow(
        "SELECT a.*, p.host as proxy_host, p.port as proxy_port, p.username as proxy_user, p.password as proxy_pass "
        "FROM instagram_accounts a LEFT JOIN instagram_proxies p ON a.proxy_id = p.id "
        "WHERE a.id = $1 AND a.user_id = $2",
        account_id, current_user.user_id
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Disconnect any existing stale session first
    if instagram_session_manager.is_connected(account_id):
        await instagram_session_manager.disconnect(account_id)

    # Launch browser visible (headless=False)
    result = await instagram_session_manager.connect(account_id, dict(account), headless=False)
    from instagram_chat_service import instagram_chat_service
    instagram_chat_service.clients.pop(account_id, None)
    return result

@router.post("/accounts/{account_id}/disconnect")
async def disconnect_account(
    account_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """Close the visible browser for the Instagram account."""
    return await instagram_session_manager.disconnect(account_id)

@router.post("/accounts/{account_id}/monitor")
async def monitor_account(
    account_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """Toggle browser window visibility (Show/Hide)."""
    from database import db

    # If already connected — toggle the visibility
    if instagram_session_manager.is_connected(account_id):
        session = instagram_session_manager.active_sessions[account_id]
        is_hidden = session.get('is_hidden', False)  # default False = window is visible

        if is_hidden:
            await instagram_session_manager.show_window(account_id)
            return {"status": "shown", "is_hidden": False}
        else:
            await instagram_session_manager.hide_window(account_id)
            return {"status": "hidden", "is_hidden": True}

    # Not connected yet — connect and immediately show it
    account = await db.fetchrow(
        "SELECT a.*, p.host as proxy_host, p.port as proxy_port, p.username as proxy_user, p.password as proxy_pass "
        "FROM instagram_accounts a LEFT JOIN instagram_proxies p ON a.proxy_id = p.id "
        "WHERE a.id = $1 AND a.user_id = $2",
        account_id, current_user.user_id
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # headless=False means: connect AND keep window visible (no auto-minimize)
    result = await instagram_session_manager.connect(account_id, dict(account), headless=False)
    from instagram_chat_service import instagram_chat_service
    instagram_chat_service.clients.pop(account_id, None)
    return result

@router.get("/accounts/{account_id}/connection-status")
async def get_connection_status(
    account_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """Check if a visible browser is currently open for this account."""
    return {"connected": instagram_session_manager.is_connected(account_id)}

@router.post("/accounts/{account_id}/focus")
async def focus_account(
    account_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """Bring the specific account's browser window to the front of the screen."""
    return await instagram_session_manager.focus_window(account_id)

@router.post("/discover")
async def discover_leads(
    request: InstagramDiscoveryRequest,
    background_tasks: BackgroundTasks,
    current_user: TokenData = Depends(get_current_user)
):
    """Stage 1: Discover Instagram leads from keywords (Asynchronous Background Mode)."""
    # 🚀 Run the scraping process in the background
    background_tasks.add_task(
        instagram_service.discover_leads_google,
        current_user.user_id, 
        request.keywords, 
        request.limit_per_keyword,
        request.discovery_intent
    )
    return {"status": "success", "message": "Discovery started in background."}

@router.get("/discovery/status")
async def get_discovery_status(
    current_user: TokenData = Depends(get_current_user)
):
    """🚥 STATUS: Check if Stage 1 Google Discovery is currently active."""
    return await instagram_service.get_discovery_status(current_user.user_id)

@router.get("/leads")
async def get_leads(
    status: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    limit: int = 10000,
    offset: int = 0,
    current_user: TokenData = Depends(get_current_user)
):
    """Retrieve Instagram leads with filtering and pagination."""
    return await instagram_service.get_leads(
        current_user.user_id, 
        status, 
        keyword, 
        limit, 
        offset
    )

@router.get("/stats")
async def get_instagram_stats(
    current_user: TokenData = Depends(get_current_user)
):
    """Retrieve statistics for Instagram lead generation."""
    return await instagram_service.get_stats(current_user.user_id)

# --- Proxies ---

@router.get("/proxies")
async def get_proxies(current_user: TokenData = Depends(get_current_user)):
    return await instagram_service.get_proxies(current_user.user_id)

@router.post("/proxies")
async def add_proxy(
    proxy: InstagramProxyCreate,
    current_user: TokenData = Depends(get_current_user)
):
    return await instagram_service.add_proxy(current_user.user_id, proxy)

class BulkProxiesRequest(BaseModel):
    proxy_string: str

@router.post("/bulk-proxies")
async def bulk_add_proxies(
    req: BulkProxiesRequest,
    current_user: TokenData = Depends(get_current_user)
):
    return await instagram_service.bulk_add_proxies(current_user.user_id, req.proxy_string)

@router.post("/bulk-proxies-file")
async def bulk_upload_proxies_file(
    file: UploadFile = File(...),
    current_user: TokenData = Depends(get_current_user)
):
    content = await file.read()
    lines = content.decode('utf-8').splitlines()
    return await instagram_service.bulk_add_proxies(current_user.user_id, lines)

# --- Accounts ---

@router.get("/accounts")
async def get_accounts(current_user: TokenData = Depends(get_current_user)):
    accounts = await instagram_service.get_accounts(current_user.user_id)
    # Add real-time connection status from session manager
    for acc in accounts:
        acc['is_connected'] = instagram_session_manager.is_connected(acc['id'])
        # Also include visibility state
        session = instagram_session_manager.active_sessions.get(acc['id'])
        acc['is_hidden'] = session.get('is_hidden', True) if session else True
    return accounts

@router.post("/accounts")
async def add_account(
    account: InstagramAccountCreate,
    current_user: TokenData = Depends(get_current_user)
):
    return await instagram_service.add_account(current_user.user_id, account)

class BulkAccountsRequest(BaseModel):
    accounts_string: str
    proxy_id: Optional[int] = None

@router.post("/bulk-accounts")
async def bulk_add_accounts(
    req: BulkAccountsRequest,
    current_user: TokenData = Depends(get_current_user)
):
    return await instagram_service.bulk_add_accounts(current_user.user_id, req.accounts_string, req.proxy_id)

@router.post("/bulk-accounts-file")
async def bulk_upload_accounts_file(
    file: UploadFile = File(...),
    proxy_id: Optional[int] = Query(None),
    current_user: TokenData = Depends(get_current_user)
):
    content = await file.read()
    lines = content.decode('utf-8').splitlines()
    return await instagram_service.bulk_add_accounts(current_user.user_id, lines, proxy_id)

@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    return await instagram_service.delete_account(current_user.user_id, account_id)

from models import InstagramAccountSettingsUpdate

@router.put("/accounts/{account_id}/settings")
async def update_account_settings(
    account_id: int,
    settings: InstagramAccountSettingsUpdate,
    current_user: TokenData = Depends(get_current_user)
):
    # Fetch existing to avoid overriding with nulls if not provided
    from database import db
    existing = await db.fetchrow("SELECT * FROM instagram_accounts WHERE id = $1 AND user_id = $2", account_id, current_user.user_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Account not found")
        
    target = settings.target_language if settings.target_language is not None else existing['target_language']
    source = settings.source_language if settings.source_language is not None else existing['source_language']
    enabled = settings.is_translation_enabled if settings.is_translation_enabled is not None else existing['is_translation_enabled']
    proxy = settings.proxy if settings.proxy is not None else existing['proxy']
    
    return await instagram_service.update_account_settings(
        current_user.user_id, 
        account_id, 
        target, 
        source, 
        enabled,
        proxy
    )

@router.delete("/proxies/{proxy_id}")
async def delete_proxy(
    proxy_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    return await instagram_service.delete_proxy(current_user.user_id, proxy_id)

@router.delete("/leads/clear")
async def clear_all_leads(current_user: TokenData = Depends(get_current_user)):
    """Wipe all Instagram leads for the user."""
    return await instagram_service.clear_all_leads(current_user.user_id)

@router.delete("/leads/{lead_id}")
async def delete_lead(
    lead_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """Delete a single Instagram lead by ID."""
    return await instagram_service.delete_lead(current_user.user_id, lead_id)

@router.post("/leads/{lead_id}/harvest")
async def harvest_lead_network(
    lead_id: int,
    background_tasks: BackgroundTasks,
    current_user: TokenData = Depends(get_current_user)
):
    """Explicitly trigger network harvesting (Followers/Following) for a vetted lead."""
    # 🏎️💨 Background: Don't make the user wait for the 2-minute scrape!
    background_tasks.add_task(instagram_service.harvest_lead_network, current_user.user_id, lead_id)
    return {"status": "success", "message": "💎 Harvest started in background! New leads will appear in your table shortly."}

@router.post("/leads/{lead_id}/reset-analysis")
async def reset_lead_analysis(
    lead_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """Reset a lead's analysis status back to google_discovered to rerun the entire pipeline."""
    return await instagram_service.reset_lead_analysis(current_user.user_id, lead_id)

@router.post("/leads/bulk-reset-analysis")
async def bulk_reset_leads_analysis(
    current_user: TokenData = Depends(get_current_user)
):
    """Bulk reset all 'google_rejected' (trash) leads back to google_discovered to rerun the entire pipeline."""
    return await instagram_service.bulk_reset_leads_analysis(current_user.user_id)

@router.post("/leads/bulk-reset-scraped-analysis")
async def bulk_reset_scraped_leads_analysis(
    current_user: TokenData = Depends(get_current_user)
):
    """Bulk reset all 'rejected' leads back to google_discovered to rerun the entire pipeline."""
    return await instagram_service.bulk_reset_scraped_leads_analysis(current_user.user_id)

# --- Analysis ---

@router.post("/leads/{lead_id}/status")
async def update_lead_status(
    lead_id: int,
    status: str = Query(...),
    current_user: TokenData = Depends(get_current_user)
):
    """Explicitly update lead status (e.g. mark as approved/rejected manually)."""
    return await instagram_service.update_lead_status(current_user.user_id, lead_id, status)

@router.post("/leads/{lead_id}/analyze")
async def manual_analyze_lead(
    lead_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """Stage 2: Manually analyze a single lead (Bio + Followers + Visuals)."""
    return await instagram_service.analyze_lead(current_user.user_id, lead_id)

@router.get("/leads/{lead_id}/network")
async def get_lead_network(
    lead_id: int,
    direction: Optional[str] = Query(None),
    current_user: TokenData = Depends(get_current_user)
):
    """Get the scraped followers/following list for a specific lead."""
    return await instagram_service.get_lead_network(current_user.user_id, lead_id, direction)

@router.post("/auto-analyze/start")
async def start_auto_pilot(current_user: TokenData = Depends(get_current_user)):
    """🏎️ START AUTO-PILOT: Scan all discovered leads in the background."""
    return await instagram_service.start_auto_analysis(current_user.user_id)

@router.post("/auto-analyze/stop")
async def stop_auto_pilot(current_user: TokenData = Depends(get_current_user)):
    """🛑 STOP AUTO-PILOT: Pause the background scanning."""
    return await instagram_service.stop_auto_analysis(current_user.user_id)

@router.get("/auto-analyze/status")
async def get_auto_pilot_status(current_user: TokenData = Depends(get_current_user)):
    """💡 STATUS: Check if Auto-Pilot is currently running."""
    return await instagram_service.get_worker_status(current_user.user_id)

# --- Stage 4: Outreach Campaign ---

class CampaignStartRequest(BaseModel):
    template: str

@router.post("/campaign/start")
async def start_campaign(req: CampaignStartRequest, current_user: TokenData = Depends(get_current_user)):
    """🚀 LAUNCH CAMPAIGN PILOT: Start sending DMs to qualified leads in background."""
    return await instagram_service.start_campaign(current_user.user_id, req.template)

@router.post("/campaign/stop")
async def stop_campaign(current_user: TokenData = Depends(get_current_user)):
    """🛑 STOP CAMPAIGN: Pause the outreach engine."""
    return await instagram_service.stop_campaign(current_user.user_id)

@router.get("/campaign/status")
async def get_campaign_status(current_user: TokenData = Depends(get_current_user)):
    """🚥 STATUS: Check if the Campaign Pilot is firing."""
    return await instagram_service.get_campaign_status(current_user.user_id)

@router.post("/campaign/fix-accounts")
async def fix_account_statuses(current_user: TokenData = Depends(get_current_user)):
    """🔧 FIX: Set all ghost accounts to 'active' status so Campaign Pilot can find them."""
    return await instagram_service.fix_account_statuses(current_user.user_id)

# --- Filter Settings ---

class FilterSettingsRequest(BaseModel):
    bio_keywords: str = ""
    min_followers: int = 0
    max_followers: int = 0
    sample_hashes: List[str] = []
    visual_niche: str = ""
    minimax_api_key: str = ""
    enable_ai_filter: bool = False
    google_niche_filter: str = ""
    ai_model: str = "gemini"
    bio_exclude_keywords: str = ""
    bio_cities_whitelist: str = ""
    enable_ai_analysis: bool = True
    ai_intent_filter: str = ""
    knowledge_base: str = ""

@router.get("/filters/settings")
async def get_filter_settings(current_user: TokenData = Depends(get_current_user)):
    """⚙️ Get the user's lead qualification filter rules (keywords + image hashes + visual niche)."""
    return await instagram_service.get_filter_settings(current_user.user_id)

@router.post("/filters/settings")
async def save_filter_settings(req: FilterSettingsRequest, current_user: TokenData = Depends(get_current_user)):
    """💾 Save bio keyword, follower range, sample image hashes, and visual niche description."""
    return await instagram_service.save_filter_settings(
        current_user.user_id, 
        req.bio_keywords, 
        req.min_followers, 
        req.max_followers, 
        req.sample_hashes, 
        req.visual_niche,
        req.minimax_api_key,
        req.enable_ai_filter,
        req.google_niche_filter,
        req.ai_model,
        req.bio_exclude_keywords,
        req.bio_cities_whitelist,
        req.enable_ai_analysis,
        req.ai_intent_filter,
        req.knowledge_base
    )

class ImageHashRequest(BaseModel):
    image_base64: str

@router.post("/filters/generate-hash")
async def generate_image_hash(req: ImageHashRequest, current_user: TokenData = Depends(get_current_user)):
    """🖼️ Generate a visual fingerprint from an uploaded sample image."""
    h = await instagram_service.generate_sample_hash(req.image_base64)
    return {"hash": h}


# --- AI Keyword Suggestions ---

async def stream_from_llama_cpp(
    url: str,
    payload: dict,
    user_id: int,
    total_wanted: int,
    existing_cities: list[str] = None
) -> tuple[list[str], bool]:
    """
    Streams a single request from llama.cpp and broadcasts cities to frontend via WebSocket
    as they appear line by line. Uses plain numbered list format (much faster than JSON).
    Filters out <think>...</think> content (Qwen 3.5 thinking mode).
    """
    import aiohttp
    import json as json_module
    import re
    import logging
    from websocket_manager import manager
    logger = logging.getLogger(__name__)

    # Override the prompt to ask for a plain numbered list — this is how the model naturally outputs
    # and is 2-3x faster than JSON format. We parse each line as it completes.
    orig_messages = payload.get("messages", [])
    patched_messages = []
    for msg in orig_messages:
        if msg.get("role") == "system":
            patched_messages.append({
                "role": "system",
                "content": (
                    msg["content"].split("Output ONLY")[0].strip() +
                    " Output ONLY a simple numbered list, one location per line. "
                    "No categories, no headers, no explanations, no JSON. Example:\n"
                    "1. Sydney\n2. Melbourne\n3. Brisbane"
                )
            })
        elif msg.get("role") == "user":
            # Replace any JSON instruction with simple list instruction
            content = msg["content"]
            content = re.sub(r'as JSON.*$', 'as a numbered list, one per line.', content, flags=re.IGNORECASE)
            content = re.sub(r'Output.*JSON.*', '', content, flags=re.IGNORECASE)
            patched_messages.append({"role": "user", "content": content.strip()})
        else:
            patched_messages.append(msg)

    stream_payload = {
        "model": payload.get("model", "qwen"),
        "messages": patched_messages,
        "temperature": payload.get("temperature", 0.7),
        "stream": True,
        # Disable thinking mode — avoids 10k+ wasted thinking tokens before output
        "thinking": False,
        "enable_thinking": False,
        "chat_template_kwargs": {"enable_thinking": False},
    }

    full_content = ""
    processed_lines: set[str] = set()   # lines already processed
    found_cities: list[str] = list(existing_cities) if existing_cities else []
    sent_cities_set: set[str] = set(found_cities)
    SKIP_KEYS = {
        "cities", "message", "keywords", "error", "regions", "states",
        "villages", "suburbs", "note", "here", "below", "following",
        "australia", "list", "the", "for", "and", "this"
    }
    # Track thinking blocks
    in_thinking = False

    def extract_city_from_line(line: str) -> str | None:
        """Extract a clean city name from a numbered or bulleted list line."""
        line = line.strip()
        if not line:
            return None
        # Remove number prefix: "1. " "23. " "1) "
        line = re.sub(r'^\d+[.)]\s*', '', line)
        # Remove bullet prefix: "- " "* " "• " "· "
        line = re.sub(r'^[-*•·]\s*', '', line)
        # Remove state/category headers like "New South Wales (NSW):" or "Victoria:"
        if line.endswith(':') or '(' in line and line.endswith(')'):
            return None
        # Remove trailing parens like "Sydney (Capital)"
        line = re.sub(r'\s*\(.*?\)\s*$', '', line).strip()
        # Must start with capital letter (city names do)
        if not line or not line[0].isupper():
            return None
        # Reasonable city name length
        if len(line) < 2 or len(line) > 80:
            return None
        # No JSON, markdown, or sentence chars
        if any(c in line for c in ['{', '}', '[', ']', '"', ':', '|', '`', '=']):
            return None
        # Not a skip word
        if line.lower() in SKIP_KEYS:
            return None
        # Not a sentence (city names are < 4 words usually)
        if len(line.split()) > 5:
            return None
        return line

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json=stream_payload,
                headers={"Content-Type": "application/json"},
                timeout=aiohttp.ClientTimeout(connect=5, total=300)
            ) as response:
                if response.status != 200:
                    logger.warning(f"llama.cpp streaming returned status {response.status}")
                    return [], False

                async for raw_line in response.content:
                    token_raw = raw_line.decode("utf-8", errors="ignore").strip()
                    if not token_raw.startswith("data: "):
                        continue
                    data_str = token_raw[6:]
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json_module.loads(data_str)
                        token = chunk["choices"][0].get("delta", {}).get("content", "")
                        if not token:
                            continue
                        full_content += token

                        # Track and skip <think>...</think> blocks
                        if "<think>" in full_content and not in_thinking:
                            in_thinking = True
                        if "</think>" in full_content and in_thinking:
                            in_thinking = False
                        if in_thinking:
                            continue

                        # Strip thinking content from what we parse
                        parse_content = re.sub(r"<think>.*?</think>", "", full_content, flags=re.DOTALL)
                        parse_content = re.sub(r"<think>.*", "", parse_content, flags=re.DOTALL)

                        # Process all COMPLETED lines (exclude last incomplete line)
                        lines = parse_content.split("\n")
                        complete_lines = lines[:-1]
                        new_cities = []

                        for raw_ln in complete_lines:
                            if raw_ln in processed_lines:
                                continue
                            processed_lines.add(raw_ln)

                            city = extract_city_from_line(raw_ln)
                            if city and city not in sent_cities_set:
                                sent_cities_set.add(city)
                                found_cities.append(city)
                                new_cities.append(city)

                        if new_cities:
                            try:
                                await manager.send_personal_message({
                                    "type": "cities_suggestion_progress",
                                    "cities": list(found_cities),
                                    "batch_index": len(found_cities),
                                    "total_batches": total_wanted,
                                    "new_added": len(new_cities)
                                }, user_id)
                            except Exception as ws_err:
                                logger.warning(f"WebSocket stream error: {ws_err}")
                    except Exception:
                        continue

                # Process any final incomplete line at end of stream
                if full_content:
                    parse_content = re.sub(r"<think>.*?</think>", "", full_content, flags=re.DOTALL)
                    for raw_ln in parse_content.split("\n"):
                        if raw_ln not in processed_lines:
                            city = extract_city_from_line(raw_ln)
                            if city and city not in sent_cities_set:
                                sent_cities_set.add(city)
                                found_cities.append(city)

        logger.info(f"Streaming complete — extracted {len(found_cities)} cities in real-time.")
        return found_cities, True

    except Exception as e:
        logger.warning(f"llama.cpp streaming failed: {type(e).__name__}: {e}")
        return [], False


def robust_json_extract(raw: str, array_key: str) -> tuple[list[str], str, bool]:
    """
    Robustly extracts the list from JSON/text output of Ollama.
    Returns: (list_of_strings, explanation_message, parsed_successfully)
    """
    import json
    import re

    cleaned = raw.strip()
    # Remove leading/trailing markdown blocks if any
    cleaned = re.sub(r'^```(json)?', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'```$', '', cleaned)
    cleaned = cleaned.strip()

    # Try matching first brace to last brace for standard JSON object
    match_obj = re.search(r'\{.*\}', cleaned, re.DOTALL)
    if match_obj:
        try:
            parsed = json.loads(match_obj.group(0))
            items = parsed.get(array_key, [])
            msg = parsed.get("message", "")
            if items:
                return [str(i).strip() for i in items if i], msg, True
        except json.JSONDecodeError:
            pass

    # Try matching first bracket to last bracket (raw JSON array)
    match_arr = re.search(r'\[.*\]', cleaned, re.DOTALL)
    if match_arr:
        try:
            parsed = json.loads(match_arr.group(0))
            if isinstance(parsed, list):
                return [str(i).strip() for i in parsed if i], "", True
        except json.JSONDecodeError:
            pass

    # Fallback: extract double-quoted strings if there are many of them
    quotes = re.findall(r'"([^"\n]+)"', cleaned)
    if len(quotes) >= 3:
        filtered_quotes = [
            q.strip() for q in quotes 
            if q.strip().lower() not in (array_key.lower(), "message", "keywords", "cities", "error")
        ]
        if filtered_quotes:
            return filtered_quotes, "Extracted from raw AI response", True

    # Fallback: line-by-line list item extraction
    lines = cleaned.splitlines()
    extracted_items = []
    for line in lines:
        line = line.strip()
        list_match = re.match(r'^[\s\-\*\d\.\:\)]+\s*(.*)', line)
        if list_match:
            item = list_match.group(1).strip()
            item = re.sub(r'^["\']|["\']$', '', item).strip()
            if item and len(item) < 100 and not item.lower().startswith(("here are", "i have", "json", "sure", "ok", "this is", "keywords", "message")):
                extracted_items.append(item)
    
    if len(extracted_items) >= 3:
        return extracted_items, "Extracted from raw AI list", True

    return [], "", False


async def make_proxied_post(session, url: str, json_data: dict, headers: dict, timeout: int, user_proxies: list) -> tuple[int, str]:
    """
    Sends a POST request through the user's proxy pool, rotating to the next proxy on failure.
    If user has no proxies, makes the request directly.
    """
    import logging
    logger = logging.getLogger(__name__)
    import aiohttp
    import random

    if not user_proxies:
        logger.info(f"No proxies configured in database pool. Making direct request to {url}...")
        async with session.post(url, json=json_data, headers=headers, timeout=aiohttp.ClientTimeout(total=timeout)) as response:
            body = await response.read()
            return response.status, body.decode('utf-8', errors='ignore')

    # Shuffle the list to randomize and distribute load
    proxy_list = list(user_proxies)
    random.shuffle(proxy_list)

    last_err = None
    for proxy in proxy_list:
        p_host = proxy.get('host')
        p_port = proxy.get('port')
        p_user = proxy.get('username')
        p_pass = proxy.get('password')
        
        proxy_url = f"http://{p_host}:{p_port}"
        proxy_auth = None
        if p_user:
            proxy_auth = aiohttp.BasicAuth(p_user, p_pass or '')

        try:
            logger.info(f"🔄 Routing request to {url} via proxy {p_host}:{p_port}...")
            async with session.post(
                url,
                json=json_data,
                headers=headers,
                proxy=proxy_url,
                proxy_auth=proxy_auth,
                timeout=aiohttp.ClientTimeout(total=timeout)
            ) as response:
                body = await response.read()
                return response.status, body.decode('utf-8', errors='ignore')
        except Exception as err:
            logger.warning(f"⚠️ Proxy connection failed for {p_host}:{p_port}: {err}. Trying next...")
            last_err = err
            continue

    raise Exception(f"All {len(user_proxies)} proxies in pool failed. Last error: {last_err}")


async def query_ai_service(messages: List[dict], system_prompt: str, array_key: str, temperature: float = 0.7, provider: Optional[str] = None, user_id: Optional[int] = None) -> tuple[list[str], str, bool, bool, str]:
    """
    Queries the selected provider (Gemini, Groq, OpenRouter, or local Ollama), or runs the waterfall fallback logic if provider is "auto" or None.
    If user_id is provided, routes external requests through the user's proxy pool.
    Returns: (suggested_items, message, ai_used, ai_online, api_provider)
    """
    import aiohttp
    import json
    from app.core.config import settings
    import logging
    logger = logging.getLogger(__name__)

    prov_lower = provider.lower().strip() if provider else "auto"

    # Retrieve user proxies if user_id is provided
    proxies = []
    if user_id:
        try:
            from database import db
            rows = await db.fetch(
                "SELECT host, port, username, password, proxy_type FROM instagram_proxies WHERE user_id = $1",
                user_id
            )
            proxies = [dict(r) for r in rows]
            logger.info(f"Loaded {len(proxies)} proxies from pool for user {user_id}")
        except Exception as db_err:
            logger.warning(f"Failed to fetch user proxies: {db_err}")

    # Retrieve parsed key lists for rotation
    gemini_keys = [k.strip() for k in (settings.gemini_api_key or "").split(",") if k.strip()]
    groq_keys = [k.strip() for k in (settings.groq_api_key or "").split(",") if k.strip()]
    openrouter_keys = [k.strip() for k in (settings.openrouter_api_key or "").split(",") if k.strip()]
    huggingface_keys = [k.strip() for k in (settings.huggingface_api_key or "").split(",") if k.strip()]

    # 🚨 Configuration validation for explicitly requested providers
    if prov_lower == "gemini" and not gemini_keys:
        return [], "⚠️ Gemini API key is missing from backend `.env`. Configure `GEMINI_API_KEY` to use Gemini.", False, False, "None"
    if prov_lower == "groq" and not groq_keys:
        return [], "⚠️ Groq API key is missing from backend `.env`. Configure `GROQ_API_KEY` to use Groq.", False, False, "None"
    if prov_lower == "openrouter" and not openrouter_keys:
        return [], "⚠️ OpenRouter API key is missing from backend `.env`. Configure `OPENROUTER_API_KEY` to use OpenRouter.", False, False, "None"
    if prov_lower in ("huggingface", "hf") and not huggingface_keys:
        return [], "⚠️ Hugging Face API key is missing from backend `.env`. Configure `HUGGINGFACE_API_KEY` to use Hugging Face.", False, False, "None"

    # 1. Try Gemini
    if prov_lower == "gemini" or (prov_lower == "auto" and gemini_keys):
        last_error_msg = ""
        for key in gemini_keys:
            try:
                logger.info(f"Sending request to Gemini API (gemini-2.5-flash-lite) using key starting with {key[:6]}...")
                gemini_contents = []
                for m in messages:
                    role = m.get("role")
                    content = m.get("content")
                    if role == "system":
                        continue
                    role_mapped = "model" if role == "assistant" else "user"
                    gemini_contents.append({
                        "role": role_mapped,
                        "parts": [{"text": content}]
                    })
                
                payload = {
                    "contents": gemini_contents,
                    "generationConfig": {
                        "temperature": temperature,
                        "responseMimeType": "application/json"
                    }
                }
                if system_prompt:
                    payload["systemInstruction"] = {
                        "parts": [{"text": system_prompt}]
                    }

                gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key={key}"
                
                async with aiohttp.ClientSession() as session:
                    status, raw_text = await make_proxied_post(
                        session=session,
                        url=gemini_url,
                        json_data=payload,
                        headers={"Content-Type": "application/json"},
                        timeout=180,
                        user_proxies=proxies
                    )
                    if status == 200:
                        data = json.loads(raw_text)
                        raw = data["candidates"][0]["content"]["parts"][0]["text"]
                        suggested_items, explanation_msg, parsed_ok = robust_json_extract(raw, array_key)
                        if suggested_items:
                            return suggested_items, explanation_msg or f"Suggestions generated via Gemini!", True, True, "Gemini API (gemini-2.5-flash)"
                        elif raw.strip():
                            return [], raw[:500], False, True, "Gemini API (gemini-2.5-flash)"
                    else:
                        logger.warning(f"Gemini API returned status {status} for key starting with {key[:6]}: {raw_text}")
                        last_error_msg = f"Gemini API Error (Status {status}): {raw_text[:500]}"
            except Exception as gemini_err:
                logger.warning(f"Failed to query Gemini API using key starting with {key[:6]}: {gemini_err}")
                last_error_msg = f"Failed to query Gemini API: {gemini_err}"

        if prov_lower == "gemini":
            return [], f"❌ All Gemini keys failed. Last error: {last_error_msg}", False, True if last_error_msg.startswith("Gemini API Error") else False, "Gemini API"

    # 2. Try Groq
    if prov_lower == "groq" or (prov_lower == "auto" and groq_keys):
        last_error_msg = ""
        for key in groq_keys:
            try:
                logger.info(f"Sending request to Groq API (llama-3.3-70b-versatile) using key starting with {key[:6]}...")
                groq_messages = []
                if system_prompt:
                    groq_messages.append({"role": "system", "content": system_prompt})
                for m in messages:
                    if m.get("role") != "system":
                        groq_messages.append(m)

                groq_url = "https://api.groq.com/openai/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
                payload = {
                    "model": "llama-3.3-70b-versatile",
                    "messages": groq_messages,
                    "temperature": temperature,
                    # NOTE: Do NOT use response_format:json_object with Groq — it causes 400 errors
                    # when the model hits the token limit mid-JSON. Use robust_json_extract instead.
                    "max_tokens": 8000
                }

                async with aiohttp.ClientSession() as session:
                    status, raw_text = await make_proxied_post(
                        session=session,
                        url=groq_url,
                        json_data=payload,
                        headers=headers,
                        timeout=180,
                        user_proxies=proxies
                    )
                    if status == 200:
                        data = json.loads(raw_text)
                        raw = data["choices"][0]["message"]["content"]
                        suggested_items, explanation_msg, parsed_ok = robust_json_extract(raw, array_key)
                        if suggested_items:
                            return suggested_items, explanation_msg or f"Suggestions generated via Groq!", True, True, "Groq API (llama-3.3-70b-versatile)"
                        elif raw.strip():
                            return [], raw[:500], False, True, "Groq API (llama-3.3-70b-versatile)"
                    else:
                        logger.warning(f"Groq API returned status {status} for key starting with {key[:6]}: {raw_text}")
                        last_error_msg = f"Groq API Error (Status {status}): {raw_text[:500]}"
            except Exception as groq_err:
                logger.warning(f"Failed to query Groq API using key starting with {key[:6]}: {groq_err}")
                last_error_msg = f"Failed to query Groq API: {groq_err}"

        if prov_lower == "groq":
            return [], f"❌ All Groq keys failed. Last error: {last_error_msg}", False, True if last_error_msg.startswith("Groq API Error") else False, "Groq API"

    # 3. Try OpenRouter
    if prov_lower == "openrouter" or (prov_lower == "auto" and openrouter_keys):
        last_error_msg = ""
        for key in openrouter_keys:
            try:
                logger.info(f"Sending request to OpenRouter API (google/gemini-2.5-flash) using key starting with {key[:6]}...")
                or_messages = []
                if system_prompt:
                    or_messages.append({"role": "system", "content": system_prompt})
                for m in messages:
                    if m.get("role") != "system":
                        or_messages.append(m)

                or_url = "https://openrouter.ai/api/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:5173",
                    "X-Title": "Telegram Translator",
                    "User-Agent": "Mozilla/5.0"
                }
                payload = {
                    "model": "google/gemini-2.5-flash",
                    "messages": or_messages,
                    "temperature": temperature,
                    "max_tokens": 500,
                    "response_format": {"type": "json_object"}
                }

                async with aiohttp.ClientSession() as session:
                    status, raw_text = await make_proxied_post(
                        session=session,
                        url=or_url,
                        json_data=payload,
                        headers=headers,
                        timeout=180,
                        user_proxies=proxies
                    )
                    if status == 200:
                        data = json.loads(raw_text)
                        raw = data["choices"][0]["message"]["content"]
                        suggested_items, explanation_msg, parsed_ok = robust_json_extract(raw, array_key)
                        if suggested_items:
                            return suggested_items, explanation_msg or f"Suggestions generated via OpenRouter!", True, True, "OpenRouter API (gemini-2.5-flash)"
                        elif raw.strip():
                            return [], raw[:500], False, True, "OpenRouter API (gemini-2.5-flash)"
                    else:
                        logger.warning(f"OpenRouter API returned status {status} for key starting with {key[:6]}: {raw_text}")
                        last_error_msg = f"OpenRouter API Error (Status {status}): {raw_text[:500]}"
            except Exception as or_err:
                logger.warning(f"Failed to query OpenRouter API using key starting with {key[:6]}: {or_err}")
                last_error_msg = f"Failed to query OpenRouter API: {or_err}"

        if prov_lower == "openrouter":
            return [], f"❌ All OpenRouter keys failed. Last error: {last_error_msg}", False, True if last_error_msg.startswith("OpenRouter API Error") else False, "OpenRouter API"

    # 4. Try Hugging Face
    if prov_lower in ("huggingface", "hf") or (prov_lower == "auto" and huggingface_keys):
        last_error_msg = ""
        for key in huggingface_keys:
            try:
                logger.info(f"Sending request to Hugging Face Router API using key starting with {key[:6]}...")
                hf_messages = []
                if system_prompt:
                    hf_messages.append({"role": "system", "content": system_prompt})
                for m in messages:
                    if m.get("role") != "system":
                        hf_messages.append(m)

                hf_url = "https://router.huggingface.co/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": "Qwen/Qwen2.5-72B-Instruct",
                    "messages": hf_messages,
                    "temperature": temperature,
                    "max_tokens": 4096
                }

                async with aiohttp.ClientSession() as session:
                    status, raw_text = await make_proxied_post(
                        session=session,
                        url=hf_url,
                        json_data=payload,
                        headers=headers,
                        timeout=180,
                        user_proxies=proxies
                    )
                    if status == 200:
                        data = json.loads(raw_text)
                        raw = data["choices"][0]["message"]["content"]
                        suggested_items, explanation_msg, parsed_ok = robust_json_extract(raw, array_key)
                        if suggested_items:
                            return suggested_items, explanation_msg or f"Suggestions generated via Hugging Face!", True, True, "Hugging Face API (Qwen2.5-72B)"
                        elif raw.strip():
                            return [], raw[:500], False, True, "Hugging Face API (Qwen2.5-72B)"
                    else:
                        logger.warning(f"Hugging Face API returned status {status} for key starting with {key[:6]}: {raw_text}")
                        last_error_msg = f"Hugging Face API Error (Status {status}): {raw_text[:500]}"
            except Exception as hf_err:
                logger.warning(f"Failed to query Hugging Face API using key starting with {key[:6]}: {hf_err}")
                last_error_msg = f"Failed to query Hugging Face API: {hf_err}"

        if prov_lower in ("huggingface", "hf"):
            return [], f"❌ All Hugging Face keys failed. Last error: {last_error_msg}", False, True    # 4.5 Try Qwen Local (llama.cpp / Ollama fallback)
    if prov_lower in ("qwen-35b-local", "qwen-14b-local", "qwen-7b-local", "llama-8b-local", "llama-3.1-8b-local", "qwen3.5-9b-local", "qwen3.5-4b-local"):
        payload_messages = [{"role": "system", "content": system_prompt}] + [m for m in messages if m.get("role") != "system"]
        payload = {
            "model": "qwen",
            "messages": payload_messages,
            "temperature": temperature,
            "response_format": {"type": "json_object"}
        }
        llama_cpp_ok = False
        raw = "{}"
 
        for port in [8080, 8000]:
            url = f"http://127.0.0.1:{port}/v1/chat/completions"
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
                            raw = data["choices"][0]["message"]["content"]
                            logger.info(f"Successfully got response from llama.cpp on port {port}")
                            llama_cpp_ok = True
                            break
                        else:
                            logger.warning(f"llama.cpp on port {port} returned status {response.status}")
            except Exception as e:
                logger.warning(f"Failed to connect to llama.cpp on port {port}: {e}")
 
        if llama_cpp_ok:
            suggested_items, explanation_msg, parsed_ok = robust_json_extract(raw, array_key)
            if suggested_items:
                return suggested_items, explanation_msg or f"Suggestions generated via local llama.cpp ({provider})!", True, True, f"llama.cpp ({provider})"
            elif raw.strip():
                return [], raw[:500], False, True, f"llama.cpp ({provider})"
        else:
            logger.info("llama.cpp not reachable. Falling back to local Ollama qwen2.5:32b...")
            ollama_url = "http://127.0.0.1:11434"
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        f"{ollama_url}/api/chat",
                        json={
                            "model": "qwen2.5:32b",
                            "messages": payload_messages,
                            "stream": False,
                            "options": {"temperature": temperature}
                        },
                        timeout=aiohttp.ClientTimeout(connect=5, total=300)
                    ) as response:
                        if response.status == 200:
                            data = await response.json()
                            raw = data.get("message", {}).get("content", "{}")
                            suggested_items, explanation_msg, parsed_ok = robust_json_extract(raw, array_key)
                            if suggested_items:
                                return suggested_items, explanation_msg or "Suggestions generated via local Ollama fallback!", True, True, "Ollama (qwen2.5:32b)"
                            elif raw.strip():
                                return [], raw[:500], False, True, "Ollama (qwen2.5:32b)"
                        else:
                            return [], f"❌ Local Ollama fallback returned status {response.status}.", False, True, "Ollama"
            except Exception as ollama_err:
                logger.info(f"Ollama fallback not reachable: {type(ollama_err).__name__}")
                return [], f"❌ Local llama.cpp and Ollama fallbacks are offline. Make sure you run llama-server on port 8080/8000 or have Ollama qwen2.5:32b installed.", False, False, "Ollama"

    # 5. Try Ollama
    if prov_lower in ("gemma", "gemma4", "ollama") or prov_lower == "auto":
        ollama_url = "http://127.0.0.1:11434"
        try:
            logger.info("Sending request to local Ollama (gemma4)...")
            ollama_messages = [{"role": "system", "content": system_prompt}] + [m for m in messages if m.get("role") != "system"]
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{ollama_url}/api/chat",
                    json={
                        "model": "gemma4",
                        "messages": ollama_messages,
                        "stream": False,
                        "options": {"temperature": temperature}
                    },
                    timeout=aiohttp.ClientTimeout(connect=5, total=180)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        raw = data.get("message", {}).get("content", "{}")
                        suggested_items, explanation_msg, parsed_ok = robust_json_extract(raw, array_key)
                        if suggested_items:
                            return suggested_items, explanation_msg or "Suggestions generated via local Ollama!", True, True, "Ollama (gemma4)"
                        elif raw.strip():
                            return [], raw[:500], False, True, "Ollama (gemma4)"
                    else:
                        if prov_lower != "auto":
                            return [], f"❌ Local Ollama returned status {response.status}.", False, True, "Ollama"
        except Exception as ollama_err:
            logger.info(f"Ollama not reachable: {type(ollama_err).__name__}")
            if prov_lower != "auto":
                return [], f"❌ Local Ollama (gemma4) is offline or unreachable. Make sure you run `ollama serve` and installed gemma4 model.", False, False, "Ollama"

    return [], "", False, False, "None (Local Fallback)"


class KeywordSuggestRequest(BaseModel):
    seed_keywords: List[str]
    conversation_history: List[dict] = []  # [{role: "user"/"assistant", content: "..."}]
    user_message: str = ""
    count: int = 20  # How many keywords to suggest (10-100)
    provider: Optional[str] = None

@router.post("/suggest-keywords")
async def suggest_keywords(
    req: KeywordSuggestRequest,
    current_user: TokenData = Depends(get_current_user)
):
    """
    🤖 AI Keyword Expansion: Generate relevant keyword variations via Ollama/Gemma.
    Falls back to smart algorithmic expansion when Ollama is unavailable.
    Also returns proxy count & estimated scrape time.
    """
    from database import db
    import aiohttp
    import json
    import logging
    logger = logging.getLogger(__name__)

    # 1. Count available proxies for this user
    proxy_count = await db.fetchval(
        "SELECT COUNT(*) FROM instagram_proxies WHERE user_id = $1", current_user.user_id
    )
    proxy_count = proxy_count or 0

    # 2. Estimate time (sequential vs parallel)
    keyword_count_estimate = req.count
    if proxy_count > 0:
        workers = min(proxy_count, keyword_count_estimate, 5)
        estimated_seconds = max(1, keyword_count_estimate // workers) * 8
        mode = "parallel"
    else:
        estimated_seconds = keyword_count_estimate * 10
        mode = "sequential"

    if estimated_seconds < 60:
        time_estimate = f"~{estimated_seconds}s"
    elif estimated_seconds < 3600:
        time_estimate = f"~{estimated_seconds // 60}m {estimated_seconds % 60}s"
    else:
        time_estimate = f"~{estimated_seconds // 3600}h {(estimated_seconds % 3600) // 60}m"

    # 3. Build prompt
    seeds_str = ", ".join(req.seed_keywords) if req.seed_keywords else "general"
    count = max(10, min(100, req.count))
    ai_count = min(count, 20)

    system_prompt = (
        f"You are an expert Instagram lead generation keyword strategist. "
        f"Your job is to help the user expand their seed keywords into {ai_count} highly relevant keyword variations "
        f"for scraping Instagram profiles via Google search. "
        f"Focus on: niches, hashtags, business types, locations, professions, product types. "
        f"Return ONLY a valid JSON object with a 'keywords' array of strings and a 'message' string explaining your choices. "
        f"Example: {{\"keywords\": [\"luxury watch dealer\", \"watch collector\", ...], \"message\": \"Here are ... variations...\"}}"
    )

    messages = [{"role": "system", "content": system_prompt}]
    for turn in req.conversation_history[-8:]:
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"]})

    if req.user_message.strip():
        user_content = req.user_message
    else:
        user_content = (
            f"Generate {ai_count} Instagram search keyword variations based on these seed keywords: {seeds_str}. "
            f"Include hashtag-style keywords, niche descriptors, location variations, and related business types."
        )
    messages.append({"role": "user", "content": user_content})

    # 4. Try AI Service (Gemini/Ollama)
    suggested_keywords, ai_message, ai_used, ai_online, api_provider = await query_ai_service(
        messages=messages,
        system_prompt=system_prompt,
        array_key="keywords",
        temperature=0.7,
        provider=req.provider,
        user_id=current_user.user_id
    )

    # 5. SMART EXPANSION: If AI gave us keywords, but we need more to reach `count`, or if AI failed completely
    if ai_used and suggested_keywords and len(suggested_keywords) < count:
        extra_needed = count - len(suggested_keywords)
        extra_kws = _generate_keyword_variations(suggested_keywords, extra_needed)
        suggested_keywords.extend(extra_kws)
    elif not suggested_keywords:
        suggested_keywords = _generate_keyword_variations(req.seed_keywords, count)
        if ai_online:
            ai_message = ai_message or f"Here are {len(suggested_keywords)} keyword variations for: {seeds_str}."
        else:
            ai_message = (
                f"✨ Generated {len(suggested_keywords)} smart keyword variations for: **{seeds_str}**.\n\n"
                f"_(Gemma AI is offline — using built-in expansion engine. "
                f"Run `ollama serve` for AI-powered conversation!)_"
            )
            api_provider = "None (Local Fallback)"

    # 6. Deduplicate
    seen = set()
    clean_keywords = []
    for kw in suggested_keywords:
        kw_norm = kw.strip().lower()
        if kw_norm and kw_norm not in seen:
            seen.add(kw_norm)
            clean_keywords.append(kw.strip())

    return {
        "keywords": clean_keywords[:count],
        "ai_message": ai_message,
        "api_provider": api_provider,
        "proxy_count": proxy_count,
        "mode": mode,
        "time_estimate": time_estimate,
        "estimated_seconds": estimated_seconds,
        "assistant_message": {
            "role": "assistant",
            "content": ai_message
        }
    }


def _generate_keyword_variations(seeds: List[str], count: int) -> List[str]:
    """
    Smart algorithmic keyword variation generator.
    Produces Instagram-search-relevant variations without requiring Ollama/AI.
    """
    if not seeds:
        seeds = ["instagram influencer"]

    variations = []
    seen_set = set()

    def add(kw: str):
        kw = kw.strip()
        if kw and kw.lower() not in seen_set and len(kw) > 2:
            seen_set.add(kw.lower())
            variations.append(kw)

    prefixes = ["luxury", "premium", "best", "top", "professional", "boutique",
                "local", "authentic", "custom", "exclusive", "independent", "certified"]
    suffixes = ["shop", "store", "dealer", "seller", "brand", "business",
                "influencer", "creator", "artist", "expert", "coach", "studio"]
    locations = ["USA", "UK", "Dubai", "NYC", "London", "Paris", "Miami",
                 "Los Angeles", "Toronto", "Sydney", "Singapore", "Berlin"]

    for seed in seeds:
        seed = seed.strip()
        if not seed:
            continue

        add(seed)
        seed_nospace = seed.replace(' ', '').lower()

        # Hashtag variations
        add(f"#{seed_nospace}")
        add(f"#{seed_nospace}shop")
        add(f"#{seed_nospace}brand")
        add(f"#{seed_nospace}life")
        add(f"#{seed_nospace}lovers")
        add(f"#{seed_nospace}community")
        add(f"#{seed_nospace}dealer")
        add(f"#{seed_nospace}collector")

        # Instagram search combos
        add(f"{seed} instagram")
        add(f"best {seed} instagram")
        add(f"top {seed} instagram")
        add(f"{seed} instagram influencer")
        add(f"{seed} instagram seller")
        add(f"{seed} for sale instagram")

        # Prefix + seed
        for p in prefixes:
            add(f"{p} {seed}")

        # Seed + suffix
        for s in suffixes:
            add(f"{seed} {s}")

        # Seed + location
        for loc in locations:
            add(f"{seed} {loc}")
            add(f"{seed} {loc} instagram")

    import random
    tail = variations[1:]
    random.shuffle(tail)
    return (variations[:1] + tail)[:count]


class DeduplicateRequest(BaseModel):
    pass  # No body needed, uses user_id from auth

@router.post("/leads/deduplicate")
async def deduplicate_leads(
    current_user: TokenData = Depends(get_current_user)
):
    """
    🧹 Purge duplicate leads: Remove all duplicate instagram_username entries,
    keeping only the most complete record (highest follower count or latest discovered).
    """
    return await instagram_service.deduplicate_leads(current_user.user_id)


@router.post("/suggest-bad-keywords")
async def suggest_bad_keywords(
    req: KeywordSuggestRequest,
    current_user: TokenData = Depends(get_current_user)
):
    """
    🤖 AI Bad Word Expansion: Generate relevant negative keyword variations (blocklist) via Ollama/Gemma.
    Falls back to smart algorithmic expansion when Ollama is unavailable.
    """
    import aiohttp
    import json
    import logging
    logger = logging.getLogger(__name__)

    count = max(10, min(100, req.count))
    seeds_str = ", ".join(req.seed_keywords) if req.seed_keywords else "competitor, spam, bot"
    ai_count = min(count, 20)

    system_prompt = (
        f"You are an expert Instagram lead filtering strategist. "
        f"Your job is to help the user build a list of {ai_count} negative/blacklist keywords (blocklist) "
        f"to filter OUT unwanted leads based on their profile bios. "
        f"You should generate direct synonyms, variations, hashtags, and closely related terms of the specific topics/seeds provided by the user. "
        f"Return ONLY a valid JSON object with a 'keywords' array of strings and a 'message' string explaining your choices. "
        f"Example: {{\"keywords\": [\"weed\", \"vape juice\", \"dispensary\", \"marijuana\"], \"message\": \"Here are variations of the requested topics...\"}}"
    )

    messages = [{"role": "system", "content": system_prompt}]
    for turn in req.conversation_history[-8:]:
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"]})

    if req.user_message.strip():
        user_content = req.user_message
    else:
        user_content = (
            f"Generate {ai_count} bad/blacklist keyword variations to filter out unwanted leads based on these specific seeds/topics to exclude: {seeds_str}. "
            f"Generate direct synonyms, alternative spellings, hashtags, and closely related words matching these exact topics."
        )
    messages.append({"role": "user", "content": user_content})

    # 4. Try AI Service (Gemini/Ollama)
    suggested_keywords, ai_message, ai_used, ai_online, api_provider = await query_ai_service(
        messages=messages,
        system_prompt=system_prompt,
        array_key="keywords",
        temperature=0.7,
        provider=req.provider,
        user_id=current_user.user_id
    )

    # 5. SMART EXPANSION: If AI gave us keywords, but we need more to reach `count`, or if AI failed completely
    if ai_used and suggested_keywords and len(suggested_keywords) < count:
        extra_needed = count - len(suggested_keywords)
        extra_kws = _generate_bad_keyword_variations(suggested_keywords, extra_needed)
        suggested_keywords.extend(extra_kws)
    elif not suggested_keywords:
        suggested_keywords = _generate_bad_keyword_variations(req.seed_keywords, count)
        if ai_online:
            ai_message = ai_message or f"Here are {len(suggested_keywords)} negative keyword variations for: {seeds_str}."
        else:
            ai_message = (
                f"✨ Generated {len(suggested_keywords)} smart negative keywords for: **{seeds_str}**.\n\n"
                f"_(Gemma AI is offline — using built-in expansion engine. "
                f"Run `ollama serve` for AI-powered conversation!)_"
            )
            api_provider = "None (Local Fallback)"

    seen = set()
    clean_keywords = []
    for kw in suggested_keywords:
        kw_norm = kw.strip().lower()
        if kw_norm and kw_norm not in seen:
            seen.add(kw_norm)
            clean_keywords.append(kw.strip())

    return {
        "keywords": clean_keywords[:count],
        "ai_message": ai_message,
        "api_provider": api_provider,
        "assistant_message": {
            "role": "assistant",
            "content": ai_message
        }
    }


def _generate_bad_keyword_variations(seeds: List[str], count: int) -> List[str]:
    """Smart algorithmic negative/blacklist keyword generator based on seed category."""
    spam_bots = [
        "bot", "fake", "spam", "follow me", "follow4follow", "like4like", "follow back", 
        "followback", "sub4sub", "gain train", "gain followers", "unfollow", "spam account",
        "inactive", "not active", "backup account", "backup", "personal account"
    ]
    commerce_promo = [
        "giveaway", "reseller", "promo", "discount", "coupon", "code", "shop", "store",
        "dropship", "wholesale", "dm for promo", "dm to collab", "collab", "pr", 
        "ambassador", "reps", "affiliate", "click link", "link in bio", "buy here", 
        "order now", "free shipping", "sales", "retailer", "stockist", "distributor"
    ]
    support_help = [
        "support", "helpdesk", "service", "customercare", "help", "official support"
    ]

    seeds_lower = [s.lower() for s in seeds]
    
    # Detect category from seeds
    use_commerce = any(any(x in s for x in ["sell", "shop", "store", "reseller", "dropship", "wholesale", "promo", "collab", "affiliate", "sale", "buyer"]) for s in seeds_lower)
    use_spam = any(any(x in s for x in ["bot", "fake", "spam", "follow", "gain", "personal", "backup", "unfollow"]) for s in seeds_lower)
    use_support = any(any(x in s for x in ["support", "help", "service", "care", "customer"]) for s in seeds_lower)

    # Pull contextual words from the detected category pools
    pool = []
    if use_commerce:
        pool.extend(commerce_promo)
    if use_spam:
        pool.extend(spam_bots)
    if use_support:
        pool.extend(support_help)
        
    # If no category detected, or pool is too small, default to combining them
    if not pool:
        pool = commerce_promo + spam_bots + support_help

    variations = []
    seen = set()
    
    # 1. Add clean seeds
    for seed in seeds:
        seed_clean = seed.strip().lower()
        if seed_clean and seed_clean not in seen:
            seen.add(seed_clean)
            variations.append(seed.strip())
            
    # 2. Add relevant contextual words from the pool
    for w in pool:
        if w not in seen:
            seen.add(w)
            variations.append(w)
            
    # 3. Generate seed combos
    for seed in seeds:
        seed_clean = seed.strip().lower()
        if not seed_clean:
            continue
        combos = [
            f"{seed_clean} store",
            f"dm for {seed_clean}",
            f"fake {seed_clean}",
            f"{seed_clean} business",
            f"{seed_clean} reseller"
        ]
        for c in combos:
            if c not in seen:
                seen.add(c)
                variations.append(c)

    import random
    tail = variations[len(seeds):]
    random.shuffle(tail)
    return (variations[:len(seeds)] + tail)[:count]


class CitiesSuggestRequest(BaseModel):
    region: str
    conversation_history: List[dict] = []  # [{role: "user"/"assistant", content: "..."}]
    user_message: str = ""
    count: int = 50  # How many cities to suggest (50-500)
    provider: Optional[str] = None


@router.post("/suggest-cities")
async def suggest_cities(
    req: CitiesSuggestRequest,
    current_user: TokenData = Depends(get_current_user)
):
    """
    🤖 AI Region/Cities Whitelist Suggestion: Generate target cities list via Ollama/Gemma.
    Falls back to smart database of cities when Ollama is offline.
    """
    import aiohttp
    import json
    import logging
    logger = logging.getLogger(__name__)

    count = max(10, min(500, req.count))
    region_str = req.region.strip() if req.region else "Australia"

    system_prompt = (
        f"You are a target region and city database expert. Your job is to help the user generate a list of cities "
        f"or regions in a target country or area to be used as a profile location whitelist. "
        f"Generate a list of {count} major cities, suburbs, or regions in the target area (e.g. {region_str}). "
        f"The user might converse with you to refine or expand this list. "
        f"Return ONLY a valid JSON object with a 'cities' array of strings and a 'message' string explaining the coverage. "
        f"Example: {{\"cities\": [\"Sydney\", \"Melbourne\", \"Brisbane\"], \"message\": \"Here are some major cities in Australia...\"}}"
    )

    messages = [{"role": "system", "content": system_prompt}]
    for turn in req.conversation_history[-8:]:
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"]})

    if req.user_message.strip():
        user_content = req.user_message
    else:
        user_content = (
            f"Generate a whitelist of {count} cities or regions in the target area: {region_str}. "
            f"Please output the result as JSON."
        )
    messages.append({"role": "user", "content": user_content})

    ai_online = False
    suggested_cities = []
    ai_message = ""
    ai_used = False
    api_provider = "None (Local Fallback)"
    # 🚀 AI BYPASS: Generating > 100 cities/suburbs takes too long for local LLMs and causes timeouts.
    # We bypass Ollama for counts > 100 and use the instant database fallback.
    selected_provider = req.provider.lower().strip() if req.provider else "auto"
    
    is_local = (
        selected_provider in ("ollama", "ollama-local", "local") or 
        selected_provider.endswith("-local") or 
        "local" in selected_provider or
        selected_provider in ("gemma", "gemma4")
    )
    batch_size = 100  # Cloud models always batch 100
    total_wanted = count
    accumulated_messages = []
    
    run_ai = True

    # ⚡ LOCAL MODELS: Use single-shot streaming (cities appear in real-time on the frontend)
    if run_ai and is_local and selected_provider.endswith("-local"):
        logger.info(f"Streaming {total_wanted} cities from llama.cpp in a single shot for: {region_str}...")
        
        # Build a single clean prompt asking for all cities at once
        combined_lower = (req.user_message or "").lower() + " " + region_str.lower()
        loc_type = "major cities, suburbs, or regions"
        if "village" in combined_lower: loc_type = "villages"
        elif "suburb" in combined_lower: loc_type = "suburbs"
        elif "region" in combined_lower: loc_type = "regions"
        elif "state" in combined_lower: loc_type = "states"
        elif "cit" in combined_lower: loc_type = "cities"
        
        stream_system_prompt = (
            f"You are a location database expert. Generate EXACTLY {total_wanted} unique {loc_type} "
            f"in: {region_str}. Output ONLY a valid JSON: "
            f'{{"cities": ["Name1", "Name2", ...]}}. No explanation.'
        )
        stream_user_msg = f"Give me {total_wanted} {loc_type} in {region_str} as JSON."
        
        stream_payload = {
            "model": "qwen",
            "messages": [
                {"role": "system", "content": stream_system_prompt},
                {"role": "user", "content": stream_user_msg}
            ],
            "temperature": 0.7,
        }
        
        llama_port = None
        for port in [8080, 8000]:
            # Quick connectivity check
            try:
                import aiohttp as _aiohttp
                async with _aiohttp.ClientSession() as _s:
                    async with _s.get(
                        f"http://127.0.0.1:{port}/health",
                        timeout=_aiohttp.ClientTimeout(connect=2, total=3)
                    ) as _r:
                        if _r.status in (200, 404):  # 404 = server up but no /health endpoint
                            llama_port = port
                            break
            except Exception:
                continue

        if llama_port is None:
            # Try connecting anyway — server might not have /health
            llama_port = 8080

        url_llama = f"http://127.0.0.1:{llama_port}/v1/chat/completions"
        
        # Stream in passes until we reach the target count (max 3 passes)
        all_cities_set: set = set()
        consecutive_failures = 0
        for pass_idx in range(3):
            remaining = total_wanted - len(suggested_cities)
            if remaining <= 0:
                break

            exclude_note = ""
            if suggested_cities:
                sample = suggested_cities[-50:]
                exclude_note = f" Do NOT include: {', '.join(sample)}."

            pass_system_prompt = (
                f"You are a location database expert. Generate EXACTLY {remaining} unique {loc_type} "
                f"in: {region_str}.{exclude_note} "
                f'Output ONLY valid JSON: {{"cities": ["Name1", "Name2", ...]}}. No explanation.'
            )
            pass_user_msg = f"Give me {remaining} more {loc_type} in {region_str} as JSON.{exclude_note}"

            stream_payload = {
                "model": "qwen",
                "messages": [
                    {"role": "system", "content": pass_system_prompt},
                    {"role": "user", "content": pass_user_msg}
                ],
                "temperature": 0.7,
            }

            logger.info(f"Streaming pass {pass_idx + 1}: requesting {remaining} more {loc_type}...")
            streamed_cities, stream_ok = await stream_from_llama_cpp(
                url=url_llama,
                payload=stream_payload,
                user_id=current_user.user_id,
                total_wanted=total_wanted,
                existing_cities=suggested_cities
            )

            if not stream_ok:
                consecutive_failures += 1
                if consecutive_failures >= 2:
                    logger.warning("llama.cpp streaming failed twice — stopping.")
                    break
                continue

            consecutive_failures = 0
            new_added = 0
            for c in streamed_cities:
                c_clean = c.strip()
                if c_clean and c_clean.lower() not in {x.lower() for x in suggested_cities}:
                    suggested_cities.append(c_clean)
                    new_added += 1
                    if len(suggested_cities) >= total_wanted:
                        break

            logger.info(f"Pass {pass_idx + 1} added {new_added} new cities. Total: {len(suggested_cities)}/{total_wanted}")
            if new_added == 0:
                logger.info("No new cities in this pass — model is exhausted. Stopping.")
                break

        if suggested_cities:
            ai_used = True
            ai_online = True
            api_provider = f"llama.cpp ({selected_provider}) — Streaming"
            ai_message = f"⚡ Streamed {len(suggested_cities)} locations live from {selected_provider}."
        else:
            logger.warning("llama.cpp streaming failed — falling back to database.")
    
    # ☁️ CLOUD MODELS: Use multi-batch approach (no streaming needed)
    elif run_ai and not is_local:
        max_batches = (total_wanted + batch_size - 1) // batch_size
        logger.info(f"Generating {total_wanted} cities/regions for {region_str} in up to {max_batches} batches using provider {selected_provider}...")
        
        consecutive_no_progress = 0
        for batch_idx in range(max_batches):
            current_batch_wanted = min(batch_size, total_wanted - len(suggested_cities))
            if current_batch_wanted <= 0:
                break
                
            # Customize the system prompt and user content to avoid duplicates
            exclude_str = ""
            if suggested_cities:
                # For local models, keep exclude list SHORT to avoid filling context window
                max_excludes = 30 if is_local else 150
                sample_excludes = suggested_cities[-max_excludes:]
                exclude_str = f" You MUST NOT include any of the following that were already generated: {', '.join(sample_excludes)}. Generate only NEW, UNIQUE ones."

            # Determine location type dynamically based on user custom message or input region
            location_type = "major cities, suburbs, or regions"
            combined_text = (req.user_message or "") + " " + (region_str or "")
            combined_lower = combined_text.lower()
            
            if "village" in combined_lower:
                location_type = "villages"
            elif "suburb" in combined_lower:
                location_type = "suburbs"
            elif "region" in combined_lower:
                location_type = "regions"
            elif "state" in combined_lower:
                location_type = "states"
            elif "city" in combined_lower or "cities" in combined_lower:
                location_type = "cities"

            system_prompt = (
                f"You are a target location database expert. Your job is to help the user generate a list of target locations "
                f"in a target country or area to be used as a profile location whitelist. "
                f"Generate a list of {current_batch_wanted} {location_type} in the target area (e.g. {region_str}).{exclude_str} "
                f"Return ONLY a valid JSON object with a 'cities' array of strings and a 'message' string explaining the coverage. "
                f"Example: {{\"cities\": [\"Sydney\", \"Melbourne\", \"Brisbane\"], \"message\": \"Here are some major locations in Australia...\"}}"
            )
            
            # Prepare messages (always pass conversation history to maintain context/instructions)
            # For local models: skip conversation history in batches beyond the first to keep context small
            batch_messages = [{"role": "system", "content": system_prompt}]
            if not is_local or batch_idx == 0:
                for turn in req.conversation_history[-4:]:
                    if turn.get("role") in ("user", "assistant") and turn.get("content"):
                        # Skip long AI responses (city lists) to save context
                        if len(turn["content"]) < 500:
                            batch_messages.append({"role": turn["role"], "content": turn["content"]})
                        
            if req.user_message.strip():
                user_content = (
                    f"{req.user_message}\n\n"
                    f"Batch Instruction: From the target area/criteria, generate {current_batch_wanted} additional unique entries. "
                    f"{exclude_str} Output your response strictly in the JSON format."
                )
            else:
                user_content = (
                    f"Generate a whitelist of {current_batch_wanted} unique cities or regions in the target area: {region_str}.{exclude_str} "
                    f"Please output the result as JSON."
                )
            batch_messages.append({"role": "user", "content": user_content})
            
            try:
                batch_cities, batch_msg, ai_used_flag, ai_online_flag, api_prov_flag = await query_ai_service(
                    messages=batch_messages,
                    system_prompt=system_prompt,
                    array_key="cities",
                    temperature=0.7,
                    provider=req.provider,
                    user_id=current_user.user_id
                )
                if ai_used_flag:
                    ai_used = True
                if ai_online_flag:
                    ai_online = True
                if api_prov_flag and api_prov_flag != "None":
                    api_provider = api_prov_flag
                    
                if not batch_cities:
                    logger.warning(f"Batch {batch_idx + 1} returned no cities, stopping generator.")
                    break
                    
                new_added = 0
                for c in batch_cities:
                    c_clean = c.strip()
                    if c_clean and c_clean.lower() not in [sc.lower() for sc in suggested_cities]:
                        suggested_cities.append(c_clean)
                        new_added += 1
                        
                if new_added > 0:
                    try:
                        from websocket_manager import manager
                        await manager.send_personal_message({
                            "type": "cities_suggestion_progress",
                            "cities": list(suggested_cities),
                            "batch_index": batch_idx + 1,
                            "total_batches": max_batches,
                            "new_added": new_added
                        }, current_user.user_id)
                    except Exception as ws_err:
                        logger.warning(f"Could not send cities websocket progress: {ws_err}")
                        
                if batch_msg:
                    accumulated_messages.append(batch_msg)
                    
                logger.info(f"Batch {batch_idx + 1} generated {len(batch_cities)} cities ({new_added} unique new ones). Total: {len(suggested_cities)}.")
                
                if new_added == 0:
                    consecutive_no_progress += 1
                else:
                    consecutive_no_progress = 0
                    
                if consecutive_no_progress >= 2:
                    logger.warning("No new unique cities added for 2 consecutive batches, stopping generator.")
                    break
            except Exception as e:
                logger.error(f"Error generating batch {batch_idx + 1}: {e}")
                break
                
        if suggested_cities:
            ai_message = f"Generated {len(suggested_cities)} unique cities/regions using {api_provider} in batches.\n\n"
            if accumulated_messages:
                ai_message += accumulated_messages[0]

    # Fallback to algorithmic cities
    if not suggested_cities:
        suggested_cities = _generate_cities_variations(region_str, count)
        if ai_used:
            ai_message = ai_message or f"Here are {len(suggested_cities)} cities/regions for: {region_str}."
        else:
            ai_message = (
                f"✨ Generated {len(suggested_cities)} smart cities/regions for: **{region_str}**.\n\n"
                f"_(Gemma AI is offline — using built-in expansion engine. "
                f"Run `ollama serve` for AI-powered conversation!)_"
            )
            api_provider = "None (Local Fallback)"

    seen = set()
    clean_cities = []
    for ct in suggested_cities:
        ct_norm = ct.strip().lower()
        if ct_norm and ct_norm not in seen:
            seen.add(ct_norm)
            clean_cities.append(ct.strip())

    return {
        "cities": clean_cities[:count],
        "ai_message": ai_message,
        "api_provider": api_provider,
        "assistant_message": {
            "role": "assistant",
            "content": ai_message
        }
    }


def _generate_cities_variations(region: str, count: int) -> List[str]:
    """Smart algorithmic city lists generator for common countries/regions."""
    import random
    region_lower = region.strip().lower()
    
    australia = [
        # Major Cities
        "Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Gold Coast", "Newcastle", 
        "Canberra", "Sunshine Coast", "Wollongong", "Hobart", "Geelong", "Townsville", "Cairns", 
        "Darwin", "Toowoomba", "Ballarat", "Bendigo", "Albury", "Launceston", "Mackay", 
        "Rockhampton", "Bunbury", "Bundaberg", "Coffs Harbour", "Wagga Wagga", "Hervey Bay", 
        "Mildura", "Shepparton", "Gladstone", "Port Macquarie", "Tamworth", "Orange", "Dubbo", 
        "Geraldton", "Nowra", "Bathurst", "Warrnambool", "Albany", "Kalgoorlie", "Mount Gambier", 
        "Lismore", "Nelson Bay", "Maryborough", "Gympie", "Alice Springs", "Devonport", 
        "Burnie", "Mount Isa", "Broken Hill", "Gawler", "Whyalla", "Murray Bridge", "Port Lincoln",
        "Port Pirie", "Port Augusta", "Goulburn", "Armidale", "Griffith", "Cessnock", "Maitland",
        "Tweed Heads", "Queanbeyan", "Grafton", "Ballina", "Singleton", "Raymond Terrace",
        "Kurri Kurri", "Batemans Bay", "Ulladulla", "Lithgow", "Bowral", "Mittagong", "Moss Vale",
        
        # States & Territories
        "New South Wales", "Victoria", "Queensland", "Western Australia", "South Australia",
        "Tasmania", "Northern Territory", "Australian Capital Territory",
        "NSW", "VIC", "QLD", "WA", "SA", "TAS", "NT", "ACT",
        
        # Regions
        "Hunter Region", "Central Coast", "Illawarra", "Riverina", "New England", "Mid North Coast",
        "Gippsland", "Goulburn Valley", "Wimmera", "Mallee", "Mornington Peninsula", "Yarra Valley",
        "Barossa Valley", "Riverland", "Eyre Peninsula", "Yorke Peninsula", "Fleurieu Peninsula",
        "Pilbara", "Kimberley", "Goldfields", "Mid West", "South West", "Great Southern",
        "Darling Downs", "Wide Bay-Burnett", "Fitzroy", "Mackay-Whitsunday", "Northern Queensland",
        "Far North Queensland",
        
        # Sydney Suburbs & Surrounds
        "Parramatta", "Blacktown", "Penrith", "Campbelltown", "Liverpool", "Bankstown", "Hornsby",
        "Chatswood", "Ryde", "Manly", "Bondi", "Cronulla", "Newtown", "Surry Hills", "Paddington",
        "Coogee", "Randwick", "Marrickville", "Castle Hill", "Baulkham Hills", "Richmond", "Windsor",
        "Brookvale", "Dee Why", "Narrabeen", "Mona Vale", "Palm Beach", "Epping", "Macquarie Park",
        "Carlingford", "Auburn", "Lidcombe", "Strathfield", "Burwood", "Ashfield", "Leichhardt",
        "Balmain", "Glebe", "Redfern", "Alexandria", "Mascot", "Kensington", "Kingsford", "Maroubra",
        "Hurstville", "Kogarah", "Rockdale", "Sutherland", "Miranda", "Engadine", "Gymea", "Caringbah",
        "St Marys", "Mount Druitt", "Quakers Hill", "Kellyville", "Rouse Hill", "Bella Vista",
        "Stanmore", "Petersham", "Enmore", "Dulwich Hill", "Lewisham", "Summer Hill", "Haberfield",
        "Five Dock", "Drummoyne", "Concord", "Rhodes", "Homebush", "Berala", "Regents Park",
        "Chester Hill", "Villawood", "Yennora", "Guildford", "Merrylands", "Harris Park",
        "Westmead", "Wentworthville", "Pendle Hill", "Toongabbie", "Seven Hills", "Kings Park",
        "Lalor Park", "Doonside", "Rooty Hill", "Minchinbury", "Mount Druitt", "St Marys",
        "Kingswood", "Werrington", "Emu Plains", "Glenmore Park", "Orchard Hills", "Colyton",
        
        # Melbourne Suburbs & Surrounds
        "Richmond", "Fitzroy", "Collingwood", "Brunswick", "Carlton", "St Kilda", "South Yarra",
        "Prahran", "Toorak", "Hawthorn", "Kew", "Camberwell", "Malvern", "Brighton", "Sandringham",
        "Cheltenham", "Dandenong", "Frankston", "Werribee", "Footscray", "Sunshine", "St Albans",
        "Keilor", "Essendon", "Moonee Ponds", "Coburg", "Preston", "Northcote", "Thornbury",
        "Heidelberg", "Ivanhoe", "Doncaster", "Box Hill", "Ringwood", "Croydon", "Mooroolbark",
        "Lilydale", "Warrandyte", "Eltham", "Greensborough", "Bundoora", "Reservoir", "Broadmeadows",
        "Glenroy", "Tullamarine", "Sunbury", "Melton", "Bacchus Marsh", "Williamstown", "Altona",
        "Port Melbourne", "Albert Park", "Middle Park", "Elsternwick", "Caulfield", "Carnegie",
        "Murrumbeena", "Glen Huntly", "Ormond", "Bentleigh", "Moorabbin", "Highett", "Hampton",
        "Black Rock", "Beaumaris", "Mentone", "Parkdale", "Mordialloc", "Aspendale", "Edithvale",
        "Chelsea", "Bonbeach", "Carrum", "Seaford", "Kananook", "Langwarrin", "Somerville",
        "Hastings VIC", "Flinders", "Portsea", "Sorrento", "Rye", "Rosebud", "Dromana", "Safety Beach",
        "Mount Martha", "Mornington", "Mount Eliza", "Frankston South", "Karingal", "Patterson Lakes",
        
        # Brisbane Suburbs & Surrounds
        "Fortitude Valley", "West End", "South Brisbane", "Paddington", "Spring Hill", "New Farm",
        "Milton", "Auchenflower", "Toowong", "Indooroopilly", "St Lucia", "Graceville", "Sherwood",
        "Corinda", "Sunnybank", "Mount Gravatt", "Carindale", "Wynnum", "Manly QLD", "Cleveland",
        "Capalaba", "Redland Bay", "Victoria Point", "Chermside", "Nundah", "Clayfield", "Ascot",
        "Hamilton QLD", "Bulimba", "Hawthorne QLD", "Morningside", "Cannon Hill", "Carina",
        "Annerley", "Yeronga", "Moorooka", "Coopers Plains", "Acacia Ridge", "Inala", "Forest Lake",
        "Ipswich", "Springfield Lakes", "Redbank Plains", "Goodna", "Kangaroo Point", "Woolloongabba",
        "Dutton Park", "Highgate Hill", "Fairfield QLD", "Tennyson", "Yeerongpilly", "Rocklea",
        "Salisbury QLD", "Archerfield", "Coopers Plains", "Macgregor", "Robertson", "Eight Mile Plains",
        "Runcorn", "Kuraby", "Stretton", "Calamvale", "Algester", "Sunnybank Hills", "Pallara",
        "Willawong", "Sherwood", "Graceville", "Chelmer", "Oxley", "Darra", "Jamboree Heights",
        "Mount Ommaney", "Jindalee", "Kenmore", "Chapel Hill", "Fig Tree Pocket", "Bellbowrie",
        
        # Perth Suburbs & Surrounds
        "Fremantle", "Joondalup", "Mandurah", "Subiaco", "Claremont", "Cottesloe", "Nedlands",
        "Dalkeith", "Peppermint Grove", "Mosman Park", "Northbridge", "Leederville", "Mount Lawley",
        "Victoria Park", "South Perth", "Applecross", "Como", "Belmont", "Midland", "Armadale WA",
        "Kelmscott", "Rockingham", "Kwinana", "Baldivis", "Wanneroo", "Scarborough WA", "Innaloo",
        "Osborne Park", "Morley", "Bayswater WA", "Bassendean", "Guildford WA", "Cannington",
        "East Perth", "West Perth", "Highgate WA", "Mount Hawthorn", "Wembley", "Floreat",
        "City Beach", "Swanbourne", "Shenton Park", "Karrakatta", "Crawley WA", "Attadale",
        "Bicton", "Palmyra", "Melville", "Willagee", "Myaree", "Booragoon", "Ardross",
        "Mount Pleasant WA", "Brentwood", "Bull Creek", "Bateman", "Winthrop", "Kardinya",
        
        # Adelaide Suburbs & Surrounds
        "North Adelaide", "Glenelg", "Brighton SA", "Henley Beach", "Semaphores", "Port Adelaide",
        "Norwood", "Burnside", "Unley", "Mitcham", "Marion", "Hallett Cove", "Noarlunga",
        "Morphett Vale", "Aldinga", "Willunga", "McLaren Vale", "Stirling", "Crafers", "Mount Barker",
        "Hahndorf", "Gumeracha", "Birdwood", "Lobethal", "Gawler East", "Elizabeth", "Salisbury SA",
        "Mawson Lakes", "Golden Grove", "Modbury", "Tea Tree Gully", "Campbelltown SA", "Payneham",
        "Walkerville", "Prospect SA", "Enfield", "Kilburn", "Gepps Cross", "Dry Creek",
        "Mawson Lakes", "Parafield", "Salisbury Downs", "Salisbury North", "Salisbury East",
        "Golden Grove", "Greenwith", "Wynn Vale", "Modbury Heights", "Hope Valley", "Highbury",
        "Dernancourt", "Athelstone", "Paradise", "Newton SA", "Rostrevor", "Magill", "Tranmere",
        
        # Additional Regional Towns
        "Katoomba", "Blackheath", "Springwood", "Penrith", "Windsor", "Richmond", "Hawkesbury",
        "Gosford", "Wyong", "Tuggerah", "The Entrance", "Terrigal", "Avoca Beach", "Bateau Bay",
        "Umina Beach", "Ettalong Beach", "Woy Woy", "Kincumber", "Green Point", "Erina",
        "Singleton", "Muswellbrook", "Scone", "Murrurundi", "Gunnedah", "Narrabri", "Moree",
        "Lightning Ridge", "Walgett", "Bourke", "Cobar", "Nyngan", "Gilgandra", "Coonamble",
        "Coonabarabran", "Wellington NSW", "Parkes", "Forbes", "Condobolin", "West Wyalong",
        "Temora", "Cootamundra", "Junee", "Gundagai", "Tumut", "Yass", "Murrumbateman",
        "Young NSW", "Cowra", "Grenfell", "Canowindra", "Molong", "Orange NSW", "Bathurst NSW"
    ]
    
    usa = [
        "New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", 
        "San Diego", "Dallas", "San Jose", "Austin", "Jacksonville", "San Francisco", "Indianapolis", 
        "Columbus", "Fort Worth", "Charlotte", "Seattle", "Denver", "El Paso", "Detroit", "Boston", 
        "Memphis", "Portland", "Oklahoma City", "Las Vegas", "Baltimore", "Louisville", "Milwaukee", 
        "Albuquerque", "Tucson", "Fresno", "Sacramento", "Kansas City", "Mesa", "Atlanta", "Omaha", 
        "Colorado Springs", "Raleigh", "Long Beach", "Virginia Beach", "Miami", "Oakland", 
        "Minneapolis", "Tulsa", "Bakersfield", "Wichita", "Arlington", "Tampa", "New Orleans", 
        "Cleveland", "Honolulu", "Anaheim", "Newark", "Santa Ana", "St. Louis", "Pittsburgh", 
        "Cincinnati", "St. Paul", "Greensboro", "Toledo", "Jersey City", "Orlando", 
        "Buffalo", "Lincoln", "Henderson", "Chula Vista", "Fort Wayne", "St. Petersburg", "Laredo",
        
        # Additional US Cities
        "Lubbock", "Madison", "Reno", "Chandler", "Glendale", "Scottsdale", "Gilbert", "Tempe",
        "Peoria", "Surprise", "Yuma", "Flagstaff", "Tuscaloosa", "Huntsville", "Mobile", "Montgomery",
        "Little Rock", "Fort Smith", "Fayetteville", "Springdale", "Jonesboro", "Denver", "Boulder",
        "Aurora", "Lakewood", "Fort Collins", "Thorn", "Pueblo", "Grand Junction", "Hartford",
        "New Haven", "Stamford", "Bridgeport", "Waterbury", "Danbury", "Norwalk", "Wilmington",
        "Dover", "Newark DE", "Jacksonville", "Miami Beach", "Key West", "Fort Lauderdale",
        "Tampa Bay", "St. Petersburg", "Tallahassee", "Pensacola", "Gainesville", "Ocala"
    ]
    
    uk = [
        "London", "Birmingham", "Glasgow", "Liverpool", "Bristol", "Manchester", "Sheffield", 
        "Leeds", "Edinburgh", "Leicester", "Coventry", "Bradford", "Cardiff", "Belfast", 
        "Nottingham", "Kingston upon Hull", "Newcastle upon Tyne", "Stoke-on-Trent", "Southampton", 
        "Derby", "Portsmouth", "Plymouth", "Brighton", "Reading", "Northampton", "Luton", 
        "Wolverhampton", "Huddersfield", "Ipswich", "York", "Gloucester", "Oxford", "Cambridge", 
        "Norwich", "Exeter", "Preston", "Blackburn", "Aberdeen", "Dundee", "Newport", "Swansea", 
        "Bournemouth", "Swindon", "Southend-on-Sea", "Middlesbrough", "Peterborough", "Milton Keynes", 
        "Colchester", "Chelmsford", "Crawley",
        
        # Additional UK
        "Bath", "Salisbury", "Winchester", "Chichester", "Canterbury", "Rochester", "St Albans",
        "Colchester", "Southend", "Basildon", "Chelmsford", "Harlow", "Gillingham", "Maidstone",
        "Tunbridge Wells", "Margate", "Dover", "Folkestone", "Hastings", "Eastbourne", "Worthing"
    ]
    
    canada = [
        "Toronto", "Montreal", "Vancouver", "Calgary", "Edmonton", "Ottawa", "Winnipeg", 
        "Quebec City", "Hamilton", "Kitchener", "London", "Victoria", "Halifax", "Oshawa", 
        "Windsor", "Saskatoon", "Regina", "St. John's", "Barrie", "Kelowna", "Abbotsford", 
        "Sherbrooke", "Kingston", "Trois-Rivieres", "Guelph", "Moncton", "Saint John", 
        "Sudbury", "Chicoutimi", "Lethbridge", "Kamloops", "Nanaimo", "Belleville", "Brantford", 
        "Sarnia", "Sault Ste. Marie", "Peterborough", "Red Deer", "Grande Prairie", "Medicine Hat", 
        "Prince George", "Chilliwack", "Granby", "Drummondville", "Saint-Hyacinthe", "Shawinigan",
        
        # Additional Canada
        "Fort McMurray", "Grande Prairie", "Airdrie", "Spruce Grove", "Leduc", "Lloydminster",
        "Burnaby", "Richmond BC", "Surrey", "Coquitlam", "Langley", "Delta", "North Vancouver"
    ]
    
    germany = [
        "Berlin", "Hamburg", "Munich", "Cologne", "Frankfurt", "Stuttgart", "Düsseldorf", 
        "Dortmund", "Essen", "Leipzig", "Bremen", "Dresden", "Hannover", "Nuremberg", 
        "Duisburg", "Bochum", "Wuppertal", "Bielefeld", "Bonn", "Münster", "Karlsruhe", 
        "Mannheim", "Augsburg", "Wiesbaden", "Gelsenkirchen", "Mönchengladbach", "Braunschweig", 
        "Chemnitz", "Aachen", "Kiel", "Halle", "Magdeburg", "Freiburg", "Krefeld", "Lübeck", 
        "Oberhausen", "Erfurt", "Mainz", "Rostock", "Kassel", "Hagen", "Hamm", "Saarbrücken", 
        "Mülheim", "Herne", "Ludwigshafen", "Osnabrück", "Solingen", "Leverkusen", "Potsdam",
        
        # Additional Germany
        "Heidelberg", "Darmstadt", "Offenbach", "Hanau", "Giessen", "Marburg", "Fulda",
        "Wiesbaden", "Mainz", "Rüsselsheim", "Bad Homburg", "Kronberg", "Königstein"
    ]

    europe = ["London", "Paris", "Berlin", "Madrid", "Rome", "Kiev", "Bucharest", "Vienna", "Hamburg", 
              "Budapest", "Warsaw", "Barcelona", "Munich", "Milan", "Prague", "Sofia", "Brussels", 
              "Birmingham", "Cologne", "Naples", "Stockholm", "Turin", "Marseille", "Amsterdam", 
              "Zagreb", "Valencia", "Leeds", "Krakow", "Frankfurt", "Athens", "Riga", "Helsinki", 
              "Copenhagen", "Dublin", "Lisbon", "Gothenburg", "Lyon", "Toulouse"]

    if "australia" in region_lower:
        base_list = australia
    elif "usa" in region_lower or "united states" in region_lower or "america" in region_lower:
        base_list = usa
    elif "uk" in region_lower or "united kingdom" in region_lower or "britain" in region_lower:
        base_list = uk
    elif "canada" in region_lower:
        base_list = canada
    elif "germany" in region_lower or "deutschland" in region_lower:
        base_list = germany
    elif "europe" in region_lower:
        base_list = europe
    else:
        words = [w.capitalize() for w in region.split() if len(w) > 2]
        if not words:
            words = ["Local"]
        base_list = [f"{words[0]} City Center", f"North {words[0]}", f"South {words[0]}", f"East {words[0]}", f"West {words[0]}", f"Greater {words[0]}", f"{words[0]} Metro", f"{words[0]} Region", f"Downtown {words[0]}", f"Central {words[0]}"]
        base_list.extend(australia[:20])

    # Deduplicate base list first
    seen = set()
    clean_base = []
    for x in base_list:
        x_norm = x.strip().lower()
        if x_norm and x_norm not in seen:
            seen.add(x_norm)
            clean_base.append(x)
            
    result = list(clean_base)
    random.shuffle(result)
    
    region_title = region.title()
    region_norm = region_title.lower()
    if region_norm not in seen:
        seen.add(region_norm)
        result.insert(0, region_title)
        
    # If the list size is smaller than requested count, dynamically pad with unique sub-regions/directions
    if len(result) < count:
        directions = ["North", "South", "East", "West", "Greater", "Central", "Metro", "Valley", "Coast", "Heights"]
        extra = []
        sample_cities = result[:30] if len(result) >= 30 else result
        for city in sample_cities:
            for d in directions:
                comb = f"{d} {city}"
                comb_norm = comb.lower()
                if comb_norm not in seen:
                    seen.add(comb_norm)
                    extra.append(comb)
        random.shuffle(extra)
        result.extend(extra)
        
    return result[:count]



