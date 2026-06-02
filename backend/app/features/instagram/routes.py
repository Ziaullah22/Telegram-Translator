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
        request.limit_per_keyword
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

@router.delete("/leads/{lead_id}")

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
    ai_model: str = "minimax-text-01"
    bio_exclude_keywords: str = ""
    bio_cities_whitelist: str = ""

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
        req.bio_cities_whitelist
    )

class ImageHashRequest(BaseModel):
    image_base64: str

@router.post("/filters/generate-hash")
async def generate_image_hash(req: ImageHashRequest, current_user: TokenData = Depends(get_current_user)):
    """🖼️ Generate a visual fingerprint from an uploaded sample image."""
    h = await instagram_service.generate_sample_hash(req.image_base64)
    return {"hash": h}


# --- AI Keyword Suggestions ---

class KeywordSuggestRequest(BaseModel):
    seed_keywords: List[str]
    conversation_history: List[dict] = []  # [{role: "user"/"assistant", content: "..."}]
    user_message: str = ""
    count: int = 20  # How many keywords to suggest (10-100)

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

    system_prompt = (
        f"You are an expert Instagram lead generation keyword strategist. "
        f"Your job is to help the user expand their seed keywords into {count} highly relevant keyword variations "
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
            f"Generate {count} Instagram search keyword variations based on these seed keywords: {seeds_str}. "
            f"Include hashtag-style keywords, niche descriptors, location variations, and related business types."
        )
    messages.append({"role": "user", "content": user_content})

    # 4. Try Ollama
    ollama_url = "http://localhost:11434"
    suggested_keywords = []
    ai_message = ""
    ai_used = False

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{ollama_url}/api/chat",
                json={
                    "model": "gemma4:e2b",
                    "messages": messages,
                    "stream": False,
                    "options": {"temperature": 0.7}
                },
                timeout=aiohttp.ClientTimeout(total=45)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    raw = data.get("message", {}).get("content", "{}")
                    import re
                    match = re.search(r'\{.*\}', raw, re.DOTALL)
                    if match:
                        try:
                            parsed = json.loads(match.group(0))
                            kws = parsed.get("keywords", [])
                            if kws:
                                suggested_keywords = kws
                                ai_message = parsed.get("message", "Here are your keyword suggestions!")
                                ai_used = True
                        except json.JSONDecodeError:
                            pass
                    if not ai_used and raw.strip():
                        # Raw text response — still try to use it as message
                        ai_message = raw[:500]
    except Exception as e:
        logger.info(f"Ollama not reachable (using smart fallback): {type(e).__name__}")

    # 5. SMART FALLBACK: Always generate variations algorithmically if AI didn't produce keywords
    if not suggested_keywords:
        suggested_keywords = _generate_keyword_variations(req.seed_keywords, count)
        if ai_used:
            ai_message = ai_message or f"Here are {len(suggested_keywords)} keyword variations for: {seeds_str}."
        else:
            ai_message = (
                f"✨ Generated {len(suggested_keywords)} smart keyword variations for: **{seeds_str}**.\n\n"
                f"_(Gemma AI is offline — using built-in expansion engine. "
                f"Run `ollama serve` for AI-powered conversation!)_"
            )

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

    system_prompt = (
        f"You are an expert Instagram lead filtering strategist. "
        f"Your job is to help the user build a list of {count} negative/blacklist keywords "
        f"to filter OUT bad leads (e.g., competitors, bots, spam, incorrect niches, giveaway accounts) based on their profile bios. "
        f"Return ONLY a valid JSON object with a 'keywords' array of strings and a 'message' string explaining your choices. "
        f"Example: {{\"keywords\": [\"giveaway\", \"reseller\", \"fake\", \"bot\", ...], \"message\": \"Here are ... variations...\"}}"
    )

    messages = [{"role": "system", "content": system_prompt}]
    for turn in req.conversation_history[-8:]:
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"]})

    if req.user_message.strip():
        user_content = req.user_message
    else:
        user_content = (
            f"Generate {count} bad/blacklist keyword variations to filter out unwanted leads based on these seeds/business niche description: {seeds_str}. "
            f"Think of words commonly found in bios of spam accounts, bots, resellers, support channels, or irrelevant creators."
        )
    messages.append({"role": "user", "content": user_content})

    ollama_url = "http://localhost:11434"
    suggested_keywords = []
    ai_message = ""
    ai_used = False

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{ollama_url}/api/chat",
                json={
                    "model": "gemma4:e2b",
                    "messages": messages,
                    "stream": False,
                    "options": {"temperature": 0.7}
                },
                timeout=aiohttp.ClientTimeout(total=45)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    raw = data.get("message", {}).get("content", "{}")
                    import re
                    match = re.search(r'\{.*\}', raw, re.DOTALL)
                    if match:
                        try:
                            parsed = json.loads(match.group(0))
                            kws = parsed.get("keywords", [])
                            if kws:
                                suggested_keywords = kws
                                ai_message = parsed.get("message", "Here are your negative keyword suggestions!")
                                ai_used = True
                        except json.JSONDecodeError:
                            pass
                    if not ai_used and raw.strip():
                        ai_message = raw[:500]
    except Exception as e:
        logger.info(f"Ollama not reachable for negative keywords (using smart fallback): {type(e).__name__}")

    # Fallback to algorithmic negative keywords
    if not suggested_keywords:
        suggested_keywords = _generate_bad_keyword_variations(req.seed_keywords, count)
        if ai_used:
            ai_message = ai_message or f"Here are {len(suggested_keywords)} negative keyword variations for: {seeds_str}."
        else:
            ai_message = (
                f"✨ Generated {len(suggested_keywords)} smart negative keywords for: **{seeds_str}**.\n\n"
                f"_(Gemma AI is offline — using built-in expansion engine. "
                f"Run `ollama serve` for AI-powered conversation!)_"
            )

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
        "assistant_message": {
            "role": "assistant",
            "content": ai_message
        }
    }


def _generate_bad_keyword_variations(seeds: List[str], count: int) -> List[str]:
    """Smart algorithmic negative/blacklist keyword generator."""
    base_bad_words = [
        "giveaway", "reseller", "promo", "discount", "coupon", "code", "shop", "store",
        "dropship", "wholesale", "bot", "fake", "spam", "support", "helpdesk", "service",
        "dm for promo", "dm to collab", "collab", "pr", "ambassador", "reps", "affiliate",
        "click link", "link in bio", "buy here", "order now", "free shipping", "sales",
        "customercare", "help", "official support", "competitor", "backup account",
        "backup", "personal account", "private profile", "not active", "inactive",
        "follow me", "follow4follow", "like4like", "follow back", "followback",
        "sub4sub", "gain train", "gain followers", "unfollow", "spam account"
    ]
    
    variations = []
    seen = set()
    
    # Add seeds first
    for seed in seeds:
        seed_clean = seed.strip().lower()
        if seed_clean and seed_clean not in seen:
            seen.add(seed_clean)
            variations.append(seed.strip())
            
    # Add relevant base bad words
    for w in base_bad_words:
        if w not in seen:
            seen.add(w)
            variations.append(w)
            
    # Mix and generate more combinations if needed
    for seed in seeds:
        seed_clean = seed.strip().lower()
        if not seed_clean:
            continue
        combos = [
            f"{seed_clean} reseller",
            f"{seed_clean} store",
            f"dm for {seed_clean}",
            f"fake {seed_clean}",
            f"scam {seed_clean}"
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

    ollama_url = "http://localhost:11434"
    suggested_cities = []
    ai_message = ""
    ai_used = False

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{ollama_url}/api/chat",
                json={
                    "model": "gemma4:e2b",
                    "messages": messages,
                    "stream": False,
                    "options": {"temperature": 0.5}
                },
                timeout=aiohttp.ClientTimeout(total=45)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    raw = data.get("message", {}).get("content", "{}")
                    import re
                    match = re.search(r'\{.*\}', raw, re.DOTALL)
                    if match:
                        try:
                            parsed = json.loads(match.group(0))
                            cts = parsed.get("cities", [])
                            if cts:
                                suggested_cities = cts
                                ai_message = parsed.get("message", "Here are your suggested cities!")
                                ai_used = True
                        except json.JSONDecodeError:
                            pass
                    if not ai_used and raw.strip():
                        ai_message = raw[:500]
    except Exception as e:
        logger.info(f"Ollama not reachable for cities (using smart fallback): {type(e).__name__}")

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
        "assistant_message": {
            "role": "assistant",
            "content": ai_message
        }
    }


def _generate_cities_variations(region: str, count: int) -> List[str]:
    """Smart algorithmic city lists generator for common countries/regions."""
    region_lower = region.strip().lower()
    
    australia = [
        "Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Gold Coast", "Newcastle", 
        "Canberra", "Sunshine Coast", "Wollongong", "Hobart", "Geelong", "Townsville", "Cairns", 
        "Darwin", "Toowoomba", "Ballarat", "Bendigo", "Albury", "Launceston", "Mackay", 
        "Rockhampton", "Bunbury", "Bundaberg", "Coffs Harbour", "Wagga Wagga", "Hervey Bay", 
        "Mildura", "Shepparton", "Gladstone", "Port Macquarie", "Tamworth", "Orange", "Dubbo", 
        "Geraldton", "Nowra", "Bathurst", "Warrnambool", "Albany", "Kalgoorlie", "Mount Gambier", 
        "Lismore", "Nelson Bay", "Maryborough", "Gympie", "Alice Springs", "Devonport", 
        "Burnie", "Mount Isa", "Broken Hill"
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
        "Buffalo", "Lincoln", "Henderson", "Chula Vista", "Fort Wayne", "St. Petersburg", "Laredo"
    ]
    
    uk = [
        "London", "Birmingham", "Glasgow", "Liverpool", "Bristol", "Manchester", "Sheffield", 
        "Leeds", "Edinburgh", "Leicester", "Coventry", "Bradford", "Cardiff", "Belfast", 
        "Nottingham", "Kingston upon Hull", "Newcastle upon Tyne", "Stoke-on-Trent", "Southampton", 
        "Derby", "Portsmouth", "Plymouth", "Brighton", "Reading", "Northampton", "Luton", 
        "Wolverhampton", "Huddersfield", "Ipswich", "York", "Gloucester", "Oxford", "Cambridge", 
        "Norwich", "Exeter", "Preston", "Blackburn", "Aberdeen", "Dundee", "Newport", "Swansea", 
        "Bournemouth", "Swindon", "Southend-on-Sea", "Middlesbrough", "Peterborough", "Milton Keynes", 
        "Colchester", "Chelmsford", "Crawley"
    ]
    
    canada = [
        "Toronto", "Montreal", "Vancouver", "Calgary", "Edmonton", "Ottawa", "Winnipeg", 
        "Quebec City", "Hamilton", "Kitchener", "London", "Victoria", "Halifax", "Oshawa", 
        "Windsor", "Saskatoon", "Regina", "St. John's", "Barrie", "Kelowna", "Abbotsford", 
        "Sherbrooke", "Kingston", "Trois-Rivieres", "Guelph", "Moncton", "Saint John", 
        "Sudbury", "Chicoutimi", "Lethbridge", "Kamloops", "Nanaimo", "Belleville", "Brantford", 
        "Sarnia", "Sault Ste. Marie", "Peterborough", "Red Deer", "Grande Prairie", "Medicine Hat", 
        "Prince George", "Chilliwack", "Granby", "Drummondville", "Saint-Hyacinthe", "Shawinigan"
    ]
    
    germany = [
        "Berlin", "Hamburg", "Munich", "Cologne", "Frankfurt", "Stuttgart", "Düsseldorf", 
        "Dortmund", "Essen", "Leipzig", "Bremen", "Dresden", "Hannover", "Nuremberg", 
        "Duisburg", "Bochum", "Wuppertal", "Bielefeld", "Bonn", "Münster", "Karlsruhe", 
        "Mannheim", "Augsburg", "Wiesbaden", "Gelsenkirchen", "Mönchengladbach", "Braunschweig", 
        "Chemnitz", "Aachen", "Kiel", "Halle", "Magdeburg", "Freiburg", "Krefeld", "Lübeck", 
        "Oberhausen", "Erfurt", "Mainz", "Rostock", "Kassel", "Hagen", "Hamm", "Saarbrücken", 
        "Mülheim", "Herne", "Ludwigshafen", "Osnabrück", "Solingen", "Leverkusen", "Potsdam"
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
        base_list.extend(australia[:10])

    import random
    result = list(base_list)
    random.shuffle(result)
    
    if region.title() not in result:
        result.insert(0, region.title())
        
    return result[:count]


