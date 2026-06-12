import os
import io
import time
from datetime import datetime
import PIL.Image
try:
    import imagehash
except ImportError:
    imagehash = None  # pip install imagehash on server
try:
    from fastapi import HTTPException
except ImportError:
    class HTTPException(Exception):  # type: ignore
        def __init__(self, status_code=500, detail=""):
            self.status_code = status_code
            self.detail = detail
import httpx
import re
import json
import logging
import asyncio
import random
from urllib.parse import quote, unquote
from typing import List, Optional, Union, Callable
from database import db
from websocket_manager import manager
from app.features.instagram_warming.browser_engine import browser_engine
from app.features.instagram_scraper.ai_engine import instagram_ai

# 🚨 SMART TELEMETRY
logging.basicConfig(level=logging.INFO, format='%(levelname)s:     %(message)s')
logger = logging.getLogger(__name__)

class InstagramChallengeException(Exception):
    """Custom exception when a security challenge is detected."""
    pass

class InstagramService:
    _harvest_tasks = {} # user_id: current_lead_id
    workers = {} # user_id: bool (auto-pilot status)
    active_pages = {} # username: page object
    _discovery_status = {} # user_id: {"active": bool, "progress": str}
    _google_ai_lock = None

    async def _analyze_google_result_sequential(self, **kwargs):
        """Ensures that Google AI analysis runs sequentially to prevent rate limits."""
        if self._google_ai_lock is None:
            self._google_ai_lock = asyncio.Lock()
        async with self._google_ai_lock:
            # 0.5s safety cooldown between requests
            await asyncio.sleep(0.5)
            from app.features.instagram_scraper.ai_engine import instagram_ai
            return await instagram_ai.analyze_google_result(**kwargs)

    def _is_valid_username(self, u: str) -> bool:
        """
        🛡️ SMART VALIDATOR: Checks if a username looks like a real human/business lead.
        """
        if not u or len(u) < 4 or len(u) > 30: return False
        
        # 1. Ignore pure numbers or hex-like random strings
        if u.isdigit() or re.match(r'^[0-9a-f]{8,}$', u): return False
        
        # 2. Ignore too many special characters (likely junk)
        if (u.count('.') + u.count('_')) > 3: return False
        
        # 3. List of junk keywords to ignore (includes common CSS rules and dev junk)
        junk = {
            'instagram', 'help', 'login', 'about', 'privacy', 'blog', 'reels', 'reel', 'p', 
            'explore', 'stories', 'direct', 'accounts', 'terms', 'legal', 'support', 'business',
            'media', 'keyframes', 'font', 'null', 'none', 'undefined', 'import', 'charset', 
            'document', 'supports', 'page', 'namespace', 'viewport', 'container', 'theme', 
            'root', 'var', 'selector', 'class', 'id', 'html', 'body', 'div', 'span', 'css', 
            'js', 'true', 'false'
        }
        if u.lower() in junk: return False
        
        # 4. Must contain at least one letter
        if not any(c.isalpha() for c in u): return False
        
        return True

    # --- Stage 1: Discovery ---

    def _extract_leads_from_html(self, html):
        """Extracts potential Instagram usernames from HTML content with strict filtering."""
        import re
        
        # 1. Broad patterns to capture URLs and @mentions
        patterns = [
            r'instagram\.com/([a-zA-Z0-9._]{3,30})/?',
            r'@([a-zA-Z0-9._]{3,30})',
            r'Handle:\s*@?([a-zA-Z0-9._]{3,30})',
            r'Username:\s*@?([a-zA-Z0-9._]{3,30})'
        ]
        
        # 2. Words that are definitely NOT usernames
        blacklist = {
            'reels', 'p', 'explore', 'stories', 'direct', 'accounts', 'login', 'about', 
            'privacy', 'terms', 'help', 'api', 'jobs', 'directory', 'topics', 'tags',
            'developer', 'business', 'press', 'contact', 'blog', 'support', 'settings',
            'archive', 'highlights', 'saved', 'igtv', 'shop', 'guides', 'activity',
            'notifications', 'emails', 'password', 'security', 'ads', 'marketing',
            'legal', 'cookies', 'safety', 'community', 'guidelines', 'verification',
            'verified', 'meta', 'facebook', 'whatsapp', 'messenger', 'oculus', 'portal',
            'instagram', 'home', 'search', 'profile', 'edit', 'following', 'followers',
            'tv', 'link', 'none', 'null'
        }
        
        found = set()
        for pattern in patterns:
            matches = re.findall(pattern, html)
            for m in matches:
                m_clean = m.lower().strip().strip('./_ @')
                # Only add if it's not in the blacklist and meets length requirements
                if m_clean and m_clean not in blacklist and len(m_clean) >= 3 and self._is_valid_username(m_clean):
                    found.add(m_clean)
        
        return list(found)

    async def discover_leads_google(self, user_id, keywords, limit_per_keyword=100, discovery_intent=None):
        """
        🚀 High-Precision Discovery Engine
        Uses targeted Google scraping with strict filtering for Instagram handles.
        Can run in parallel if proxies are configured, otherwise runs sequentially.
        """
        self._discovery_status[user_id] = {
            "active": True,
            "progress": f"🚀 Initializing discovery for {len(keywords)} keyword(s)..."
        }
        
        new_count = 0
        new_count_lock = asyncio.Lock()
        
        try:
            # Stage 1 = pure scraping — NO AI filter here (user requested AI-free discovery)
            # AI vetting happens exclusively in Stage 2 (auto-analyze)
            enable_ai_filter = False  # ✅ Always disabled in Stage 1
            google_niche_filter = ""
            ai_model = "minimax-text-01"
            minimax_api_key = ""
 
            # Fetch proxies for user
            proxy_rows = await db.fetch(
                "SELECT host, port, username, password, proxy_type FROM instagram_proxies WHERE user_id = $1", user_id
            )
            proxies = [dict(r) for r in proxy_rows] if proxy_rows else []
 
            async def run_single_keyword(keyword, kw_idx, proxy=None):
                nonlocal new_count
                # 🛠️ Direct Username Detection
                kw_clean = keyword.strip().lstrip('@')
                if ' ' not in kw_clean and len(kw_clean) > 3 and self._is_valid_username(kw_clean):
                    logger.info(f"🎯 Direct Username Detected: @{kw_clean}")
                    data_audit = {}
                    if discovery_intent:
                        data_audit["discovery_intent"] = discovery_intent
                    status = await db.execute(
                        "INSERT INTO instagram_leads (user_id, instagram_username, discovery_keyword, status, data_audit_json) "
                        "VALUES ($1, $2, $3, 'discovered', $4) ON CONFLICT DO NOTHING", 
                        user_id, kw_clean, "direct_add", json.dumps(data_audit)
                    )
                    if status == "INSERT 0 1":
                        async with new_count_lock:
                            new_count += 1
 
                msg = f"🔍 [Ultra Discovery] Processing '{keyword}' ({kw_idx+1}/{len(keywords)})..."
                if proxy:
                    msg = f"🔍 [Parallel Discovery] Processing '{keyword}' ({kw_idx+1}/{len(keywords)}) using proxy {proxy.get('host')}..."
                logger.info(msg)
                self._discovery_status[user_id]["progress"] = msg
                try: await manager.send_personal_message({"type": "discovery_progress", "message": msg}, user_id)
                except: pass
 
                current_kw_new = 0
                
                # 🚀 STAGE A: Scrapling Ultra Surge (Fast & Stealthy Google)
                try:
                    # Construct Playwright proxy settings if proxy is specified
                    playwright_proxy = None
                    if proxy:
                        server_prefix = "socks5://" if proxy.get("proxy_type") == "socks5" else "http://"
                        playwright_proxy = {
                            "server": f"{server_prefix}{proxy['host']}:{proxy['port']}"
                        }
                        if proxy.get("username"):
                            playwright_proxy["username"] = proxy["username"]
                        if proxy.get("password"):
                            playwright_proxy["password"] = proxy["password"]
 
                    surge_leads = await self._perform_scrapling_discovery(
                        keyword, 
                        limit=limit_per_keyword,
                        enable_ai_filter=enable_ai_filter,
                        google_niche_filter=google_niche_filter,
                        ai_model=ai_model,
                        minimax_api_key=minimax_api_key,
                        user_id=user_id,
                        proxy=playwright_proxy,
                        discovery_intent=discovery_intent
                    )
                    if surge_leads:
                        for u in surge_leads:
                            if current_kw_new >= limit_per_keyword: break
                            data_audit = {}
                            if discovery_intent:
                                data_audit["discovery_intent"] = discovery_intent
                            status = await db.execute(
                                "INSERT INTO instagram_leads (user_id, instagram_username, discovery_keyword, status, data_audit_json) "
                                "VALUES ($1, $2, $3, 'discovered', $4) "
                                "ON CONFLICT (user_id, instagram_username) DO UPDATE SET "
                                "data_audit_json = COALESCE(instagram_leads.data_audit_json, '{}'::jsonb) || EXCLUDED.data_audit_json, "
                                "discovery_keyword = EXCLUDED.discovery_keyword",
                                user_id, u, keyword, json.dumps(data_audit)
                            )
                            if status == "INSERT 0 1": 
                                async with new_count_lock:
                                    new_count += 1
                                current_kw_new += 1
                except Exception as e:
                    logger.warning(f"⚠️ Google Surge failed for '{keyword}': {e}")
 
            if proxies:
                # 🚀 Browser Reuse Mode: up to 20 browsers, each handles a BATCH of keywords
                max_workers = min(len(proxies), 20)
                logger.info(f"🛰️ Parallel Browser Mode: {max_workers} browsers open simultaneously, each reusing session across keyword batch.")
 
                # Split keywords into batches — one batch per browser worker
                keyword_batches = [[] for _ in range(max_workers)]
                for kw_idx, keyword in enumerate(keywords):
                    keyword_batches[kw_idx % max_workers].append((kw_idx, keyword))
 
                async def browser_worker(batch, proxy):
                    """One browser handles its entire batch of keywords without closing."""
                    await self._run_browser_worker(
                        batch=batch,
                        total_keywords=len(keywords),
                        limit_per_keyword=limit_per_keyword,
                        enable_ai_filter=enable_ai_filter,
                        google_niche_filter=google_niche_filter,
                        ai_model=ai_model,
                        minimax_api_key=minimax_api_key,
                        user_id=user_id,
                        proxy=proxy,
                        new_count_ref=[new_count],
                        new_count_lock=new_count_lock,
                        discovery_intent=discovery_intent
                    )
 
                worker_tasks = []
                for i in range(max_workers):
                    if keyword_batches[i]:  # only spawn if batch has keywords
                        assigned_proxy = proxies[i % len(proxies)]
                        worker_tasks.append(browser_worker(keyword_batches[i], assigned_proxy))
 
                await asyncio.gather(*worker_tasks)
            else:
                # 🔒 Run sequentially if no proxies (safety first)
                logger.info("🔒 Sequential Discovery Mode: No proxies configured. Running sequentially.")
                for kw_idx, keyword in enumerate(keywords):
                    await run_single_keyword(keyword, kw_idx)
                    await asyncio.sleep(random.uniform(5.0, 10.0))

        except Exception as e:
            logger.error(f"❌ Discovery mission crashed: {e}")
        finally:
            self._discovery_status[user_id] = {
                "active": False,
                "progress": ""
            }
            logger.info(f"📊 Mission Summary: {new_count} NEW leads found total.")
            try:
                await manager.send_personal_message({
                    "type": "discovery_finished",
                    "message": f"📊 Mission complete! Found {new_count} NEW leads total."
                }, user_id)
            except: pass
            
        return new_count

    async def _run_browser_worker(self, batch: list, total_keywords: int, limit_per_keyword: int, enable_ai_filter: bool, google_niche_filter: str, ai_model: str, minimax_api_key: str, user_id: int, proxy: Optional[dict], new_count_ref: list, new_count_lock: asyncio.Lock, discovery_intent: str = None):
        """
        🏎️ BROWSER WORKER: Opens ONE browser and processes a BATCH of keywords sequentially.
        After each keyword, it clears the Google search box and types the next one — no browser restart!
        """
        from patchright.async_api import async_playwright
 
        launch_args = {
            "headless": False,
            "channel": "chrome",
            "args": [
                "--window-state=minimized",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-blink-features=AutomationControlled"
            ]
        }
        # Convert raw DB proxy dict → Playwright proxy format
        if proxy and proxy.get("host"):
            server_prefix = "socks5://" if proxy.get("proxy_type") == "socks5" else "http://"
            playwright_proxy = {"server": f"{server_prefix}{proxy['host']}:{proxy['port']}"}
            if proxy.get("username"):
                playwright_proxy["username"] = proxy["username"]
            if proxy.get("password"):
                playwright_proxy["password"] = proxy["password"]
            launch_args["proxy"] = playwright_proxy
 
        async with async_playwright() as p:
            browser = await p.chromium.launch(**launch_args)
            context = await browser.new_context(
                no_viewport=True,
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
            is_first_keyword = True
 
            for kw_idx, keyword in batch:
                try:
                    msg = f"🔍 [Browser Worker] Processing '{keyword}' ({kw_idx+1}/{total_keywords}) — reusing browser session..."
                    logger.info(msg)
                    try: await manager.send_personal_message({"type": "discovery_progress", "message": msg}, user_id)
                    except: pass
 
                    found = await self._scrape_keyword_on_page(
                        page=page,
                        keyword=keyword,
                        kw_idx=kw_idx,
                        limit=limit_per_keyword,
                        enable_ai_filter=enable_ai_filter,
                        google_niche_filter=google_niche_filter,
                        ai_model=ai_model,
                        minimax_api_key=minimax_api_key,
                        user_id=user_id,
                        is_first_keyword=is_first_keyword,
                        discovery_intent=discovery_intent
                    )
                    is_first_keyword = False

                    # Count new leads added
                    async with new_count_lock:
                        new_count_ref[0] += found

                    # Brief human pause between keywords
                    await asyncio.sleep(random.uniform(3.0, 6.0))

                except Exception as e:
                    logger.error(f"❌ Browser worker error on keyword '{keyword}': {e}")
                    is_first_keyword = True  # reset so next keyword opens fresh

            await browser.close()
            logger.info(f"🏁 Browser worker finished batch of {len(batch)} keywords.")

    async def _scrape_keyword_on_page(self, page, keyword: str, kw_idx: int, limit: int, enable_ai_filter: bool, google_niche_filter: str, ai_model: str, minimax_api_key: str, user_id: int, is_first_keyword: bool, discovery_intent: str = None) -> int:
        """
        🔍 Scrapes Google for ONE keyword using an already-open page.
        If is_first_keyword: navigates to Google home and types the query.
        Otherwise: Ctrl+A → clears the search box → types the new keyword.
        Returns the count of NEW leads saved to DB.
        """
        found_usernames = []
        seen = set()
        new_leads_count = 0
        search_query = f"{keyword} site:instagram.com"
 
        # ---- FIRST keyword: open Google home and type ----
        if is_first_keyword:
            logger.info("🌐 Opening Google homepage for first keyword...")
            await page.goto("https://www.google.com", wait_until="domcontentloaded")
            await asyncio.sleep(random.uniform(2.0, 4.0))
 
            # Dismiss consent/cookie popups
            try:
                popup_selectors = [
                    "button#L2AGLb", "button:has-text('Accept all')",
                    "button:has-text('I agree')", "button:has-text('Agree')",
                    "button:has-text('Consent')", "button:has-text('No thanks')",
                    "button:has-text('Stay signed out')"
                ]
                for selector in popup_selectors:
                    btn = await page.query_selector(selector)
                    if btn and await btn.is_visible():
                        logger.info(f"🧹 Dismissing popup: '{selector}'")
                        await btn.click()
                        await asyncio.sleep(random.uniform(1.0, 2.0))
            except Exception as pe:
                logger.warning(f"⚠️ Popup bypass warning: {pe}")
 
            search_box = await page.query_selector('textarea[name="q"], input[name="q"]')
            if search_box:
                await search_box.click()
                await asyncio.sleep(random.uniform(0.5, 1.2))
                for char in search_query:
                    await page.keyboard.type(char)
                    await asyncio.sleep(random.uniform(0.08, 0.22))
                await asyncio.sleep(random.uniform(0.8, 1.5))
                await page.keyboard.press("Enter")
            else:
                logger.warning("⚠️ Search box not found. Direct URL navigation...")
                await page.goto(f"https://www.google.com/search?q={quote(search_query)}", wait_until="domcontentloaded")
 
        # ---- SUBSEQUENT keywords: reuse the same tab, clear search box ----
        else:
            logger.info(f"♻️ Reusing browser — clearing search box for next keyword: '{keyword}'")
            try:
                search_box = await page.query_selector('textarea[name="q"], input[name="q"]')
                if search_box:
                    await search_box.click()
                    await asyncio.sleep(random.uniform(0.3, 0.7))
                    # Select all + delete (like a human pressing Ctrl+A then typing)
                    await page.keyboard.press("Control+A")
                    await asyncio.sleep(random.uniform(0.2, 0.4))
                    await page.keyboard.press("Delete")
                    await asyncio.sleep(random.uniform(0.3, 0.6))
                    # Type new search query character by character
                    for char in search_query:
                        await page.keyboard.type(char)
                        await asyncio.sleep(random.uniform(0.07, 0.18))
                    await asyncio.sleep(random.uniform(0.8, 1.5))
                    await page.keyboard.press("Enter")
                else:
                    # Fallback: direct URL if search box not found
                    logger.warning("⚠️ Search box not found after reuse. Direct URL navigation...")
                    await page.goto(f"https://www.google.com/search?q={quote(search_query)}", wait_until="domcontentloaded")
            except Exception as e:
                logger.warning(f"⚠️ Search box reuse failed: {e}. Falling back to direct URL...")
                await page.goto(f"https://www.google.com/search?q={quote(search_query)}", wait_until="domcontentloaded")
 
        # ---- Scrape multiple pages for this keyword ----
        for page_num in range(20):
            if len(found_usernames) >= limit:
                break
            start_idx = page_num * 10
            logger.info(f"🔥 [SURGE] Page {page_num+1} for '{keyword}'...")
 
            try:
                if page_num > 0:
                    # Navigate to next page
                    logger.info("⏬ Scrolling to find Next page button...")
                    for _ in range(3):
                        await page.evaluate(f"window.scrollBy(0, {random.randint(300, 600)})")
                        await asyncio.sleep(random.uniform(0.5, 1.0))
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    await asyncio.sleep(random.uniform(2.0, 3.5))
 
                    next_btn = await page.query_selector("a#pnnext")
                    if next_btn:
                        await next_btn.click()
                    else:
                        logger.warning("⚠️ Next page button not found. Direct URL...")
                        await page.goto(f"https://www.google.com/search?q={quote(search_query)}&start={start_idx}", wait_until="domcontentloaded")
 
                logger.info("⏳ Waiting for results (3s)...")
                await asyncio.sleep(3)
 
                # CAPTCHA detection
                current_url = page.url
                is_captcha = "/sorry/" in current_url or (await page.query_selector("form[action*='/sorry/'], #captcha-form") is not None)
                if is_captcha:
                    logger.warning("🚨 CAPTCHA detected! Waiting for manual solve...")
                    for _ in range(60):
                        await asyncio.sleep(5)
                        current_url = page.url
                        is_captcha = "/sorry/" in current_url or (await page.query_selector("form[action*='/sorry/'], #captcha-form") is not None)
                        if not is_captcha:
                            logger.info("✅ CAPTCHA resolved!")
                            break
 
                # Human scrolling
                for _ in range(random.randint(5, 8)):
                    await page.evaluate(f"window.scrollBy(0, {random.randint(300, 600)})")
                    await asyncio.sleep(random.uniform(0.8, 1.5))
 
                # Extract leads from cards
                cards = await page.query_selector_all('div.g, div[data-ved]')
                processed_card_leads = 0
                links = []
 
                if cards and len(cards) > 0:
                    logger.info(f"📋 Found {len(cards)} result cards for '{keyword}'")
                    for card in cards:
                        if len(found_usernames) >= limit:
                            break
                        link_el = await card.query_selector('a[href*="instagram.com"]')
                        if not link_el:
                            continue
                        href = await link_el.get_attribute('href')
                        if href and '/url?q=' in href:
                            href = href.split('/url?q=')[1].split('&')[0]
                        if href:
                            match = re.search(r'instagram\.com/([a-zA-Z0-9._]{3,30})', href)
                            if match:
                                u = match.group(1).strip().strip('./_').lower()
                                if self._is_valid_username(u) and u not in seen:
                                    processed_card_leads += 1
                                    logger.info(f"✨ Approved Lead: @{u}")
                                    found_usernames.append(u)
                                    seen.add(u)
                                    # Extract title and snippet from card for later AI filter use
                                    try:
                                        title_el = await card.query_selector('h3')
                                        card_title = await title_el.inner_text() if title_el else ""
                                        card_snippet = await card.inner_text()
                                        if card_title and card_title in card_snippet:
                                            card_snippet = card_snippet.replace(card_title, "").strip()
                                    except:
                                        card_title = ""
                                        card_snippet = ""
                                    try:
                                        data_audit = {
                                            "google_snippet_data": {
                                                "title": card_title,
                                                "url": href,
                                                "snippet": card_snippet
                                            }
                                        }
                                        if discovery_intent:
                                            data_audit["discovery_intent"] = discovery_intent
                                        new_id = await db.fetchval(
                                            "INSERT INTO instagram_leads (user_id, instagram_username, discovery_keyword, status, data_audit_json) "
                                            "VALUES ($1, $2, $3, 'discovered', $4) "
                                            "ON CONFLICT (user_id, instagram_username) DO UPDATE SET "
                                            "data_audit_json = COALESCE(instagram_leads.data_audit_json, '{}'::jsonb) || EXCLUDED.data_audit_json, "
                                            "discovery_keyword = EXCLUDED.discovery_keyword "
                                            "RETURNING id",
                                            user_id, u, keyword, json.dumps(data_audit)
                                        )
                                        if new_id:
                                            new_leads_count += 1
                                            try:
                                                await manager.send_personal_message({
                                                    "type": "new_lead_discovered",
                                                    "lead_id": new_id,
                                                    "status": "discovered"
                                                }, user_id)
                                            except: pass
                                    except Exception as db_err:
                                        logger.error(f"❌ DB insert error for @{u}: {db_err}")
 
                # Fallback: regex from page text if cards returned nothing
                if processed_card_leads == 0:
                    logger.warning("⚠️ Card selector found no leads. Using regex fallback...")
                    page_content = await page.evaluate("() => document.body.innerText")
                    links = await page.query_selector_all('a[href*="instagram.com"]')
                    for link in links:
                        href = await link.get_attribute('href')
                        if href and '/url?q=' in href:
                            href = href.split('/url?q=')[1].split('&')[0]
                        if href:
                            match = re.search(r'instagram\.com/([a-zA-Z0-9._]{3,30})', href)
                            if match:
                                u = match.group(1).strip().strip('./_').lower()
                                if self._is_valid_username(u) and u not in seen:
                                    logger.info(f"✨ Link Lead: @{u}")
                                    found_usernames.append(u)
                                    seen.add(u)
                                    try:
                                        data_audit = {
                                            "google_snippet_data": {
                                                "title": "",
                                                "url": href,
                                                "snippet": ""
                                            }
                                        }
                                        if discovery_intent:
                                            data_audit["discovery_intent"] = discovery_intent
                                        new_id = await db.fetchval(
                                            "INSERT INTO instagram_leads (user_id, instagram_username, discovery_keyword, status, data_audit_json) "
                                            "VALUES ($1, $2, $3, 'discovered', $4) "
                                            "ON CONFLICT (user_id, instagram_username) DO UPDATE SET "
                                            "data_audit_json = COALESCE(instagram_leads.data_audit_json, '{}'::jsonb) || EXCLUDED.data_audit_json, "
                                            "discovery_keyword = EXCLUDED.discovery_keyword "
                                            "RETURNING id",
                                            user_id, u, keyword, json.dumps(data_audit)
                                        )
                                        if new_id:
                                            new_leads_count += 1
                                            try:
                                                await manager.send_personal_message({"type": "new_lead_discovered", "lead_id": new_id, "status": "discovered"}, user_id)
                                            except: pass
                                    except Exception as db_err:
                                        logger.error(f"❌ DB insert error for @{u}: {db_err}")
 
                    snippets = re.findall(r'(?:@|instagram\.com/)([a-z0-9._]{3,30})', page_content.lower())
                    for u in snippets:
                        u = u.strip().strip('./_')
                        if self._is_valid_username(u) and u not in seen:
                            found_usernames.append(u)
                            seen.add(u)
                            try:
                                data_audit = {
                                    "google_snippet_data": {
                                        "title": "",
                                        "url": f"https://www.instagram.com/{u}/",
                                        "snippet": ""
                                    }
                                }
                                if discovery_intent:
                                    data_audit["discovery_intent"] = discovery_intent
                                new_id = await db.fetchval(
                                    "INSERT INTO instagram_leads (user_id, instagram_username, discovery_keyword, status, data_audit_json) "
                                    "VALUES ($1, $2, $3, 'discovered', $4) "
                                    "ON CONFLICT (user_id, instagram_username) DO UPDATE SET "
                                    "data_audit_json = COALESCE(instagram_leads.data_audit_json, '{}'::jsonb) || EXCLUDED.data_audit_json, "
                                    "discovery_keyword = EXCLUDED.discovery_keyword "
                                    "RETURNING id",
                                    user_id, u, keyword, json.dumps(data_audit)
                                )
                                if new_id:
                                    new_leads_count += 1
                                    try:
                                        await manager.send_personal_message({"type": "new_lead_discovered", "lead_id": new_id, "status": "discovered"}, user_id)
                                    except: pass
                            except Exception as db_err:
                                logger.error(f"❌ DB insert error for @{u}: {db_err}")

                    if processed_card_leads == 0 and len(links) < 5:
                        break

                await asyncio.sleep(random.uniform(4, 7))

            except Exception as e:
                logger.error(f"❌ Scrape error on page {page_num+1} for '{keyword}': {e}")
                break

        logger.info(f"🎯 Keyword '{keyword}' done. Found {len(found_usernames)} leads ({new_leads_count} new).")
        return new_leads_count

    async def _perform_scrapling_discovery(self, keyword: str, limit: int = 50, enable_ai_filter: bool = False, google_niche_filter: str = "", ai_model: str = "minimax-text-01", minimax_api_key: str = "", user_id: int = None, proxy: Optional[dict] = None, discovery_intent: str = None):
        """
        🚀 ULTRA DISCOVERY SURGE (PATCHRIGHT GHOST MODE)
        Uses raw patchright for total control and visible navigation.
        """
        from patchright.async_api import async_playwright
        found_usernames = []
        seen = set()
 
        async with async_playwright() as p:
            # 🖥️ LAUNCH ACTUAL GOOGLE CHROME WITH STEALTH FLAGS
            launch_args = {
                "headless": False,
                "channel": "chrome",
                "args": [
                    "--window-state=minimized",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-blink-features=AutomationControlled"
                ]
            }
            if proxy:
                launch_args["proxy"] = proxy
 
            browser = await p.chromium.launch(**launch_args)
            # 🖼️ NO VIEWPORT (Let it use the full screen)
            context = await browser.new_context(
                no_viewport=True,
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
 
            # 🚀 MAX RESULTS MODE (Up to 20 pages or until results end)
            for page_num in range(20):
                if len(found_usernames) >= limit: break
                start_idx = page_num * 10
                logger.info(f"🔥 [ULTRA SURGE] Google Page {page_num+1} (Deep Scrape) for '{keyword}'...")
 
                search_query = f"{keyword} site:instagram.com"
                url = f"https://www.google.com/search?q={quote(search_query)}&start={start_idx}"
 
                try:
                    if page_num == 0:
                        # 1. Open Google home page directly
                        logger.info("🌐 Opening Google homepage...")
                        await page.goto("https://www.google.com", wait_until="domcontentloaded")
                        await asyncio.sleep(random.uniform(2.0, 4.0))
                        
                        # 1.5 Clear Google Cookie Consent or Sign-in Popups
                        try:
                            popup_selectors = [
                                "button#L2AGLb",                   # EU Cookie Accept All
                                "button:has-text('Accept all')",   # Generic Accept All
                                "button:has-text('I agree')",      # Generic Agree
                                "button:has-text('Agree')",
                                "button:has-text('Consent')",
                                "button:has-text('No thanks')",    # Sign-in popup bypass
                                "button:has-text('Stay signed out')" # Sign-in popup bypass alternate
                            ]
                            for selector in popup_selectors:
                                btn = await page.query_selector(selector)
                                if btn and await btn.is_visible():
                                    logger.info(f"🧹 Dismissing Google popup using button '{selector}'...")
                                    await btn.click()
                                    await asyncio.sleep(random.uniform(1.0, 2.0))
                        except Exception as pe:
                            logger.warning(f"⚠️ Popup bypass warning: {pe}")
                        
                        # 2. Find the search input field
                        search_box = await page.query_selector('textarea[name="q"], input[name="q"]')
                        if search_box:
                            logger.info(f"⌨️ Typing search query: '{search_query}' with human speed...")
                            await search_box.click()
                            await asyncio.sleep(random.uniform(0.5, 1.2))
                            
                            # Type character-by-character with random delays
                            for char in search_query:
                                await page.keyboard.type(char)
                                await asyncio.sleep(random.uniform(0.08, 0.22))
                                
                            await asyncio.sleep(random.uniform(0.8, 1.5))
                            logger.info("🚀 Pressing Enter to search...")
                            await page.keyboard.press("Enter")
                        else:
                            # Fallback if search input field is not found
                            logger.warning("⚠️ Search input field not found. Loading search query directly...")
                            await page.goto(url, wait_until="domcontentloaded")
                    else:
                        # 3. For page 2+, scroll down and try to click the "Next" button
                        logger.info("⏬ Scrolling down to find the Next page button...")
                        for _ in range(3):
                            scroll_step = random.randint(300, 600)
                            await page.evaluate(f"window.scrollBy(0, {scroll_step})")
                            await asyncio.sleep(random.uniform(0.5, 1.0))
                        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                        await asyncio.sleep(random.uniform(2.0, 3.5))
                        
                        next_btn = await page.query_selector("a#pnnext")
                        if next_btn:
                            logger.info("🖱️ Clicking next page button...")
                            try:
                                await next_btn.click(force=True, timeout=5000)
                            except Exception as click_err:
                                logger.warning(f"⚠️ Next page click failed: {click_err}. Trying JS evaluation click...")
                                try:
                                    await page.evaluate("el => el.click()", next_btn)
                                except Exception as js_err:
                                    logger.warning(f"⚠️ JS click failed: {js_err}. Navigating directly...")
                                    await page.goto(url, wait_until="domcontentloaded")
                        else:
                            logger.warning("⚠️ Next page button not found. Navigating directly...")
                            await page.goto(url, wait_until="domcontentloaded")
 
                    logger.info("⏳ Waiting for Google Results (3s)...")
                    await asyncio.sleep(3) 
 
                    # 🛡️ Robot Check detection
                    current_url = page.url
                    is_captcha = "/sorry/" in current_url or (await page.query_selector("form[action*='/sorry/'], #captcha-form") is not None)
                    if is_captcha:
                        logger.warning("🚨 GOOGLE CAPTCHA! Please solve it in the window...")
                        for _ in range(60):
                            await asyncio.sleep(5)
                            current_url = page.url
                            is_captcha = "/sorry/" in current_url or (await page.query_selector("form[action*='/sorry/'], #captcha-form") is not None)
                            if not is_captcha:
                                logger.info("✅ CAPTCHA Resolved!")
                                break
 
                    # 📜 HUMAN SCROLLING (Slow & Steady)
                    logger.info("⏬ Scrolling results like a human...")
                    for _ in range(random.randint(5, 8)):
                        scroll_step = random.randint(300, 600)
                        await page.evaluate(f"window.scrollBy(0, {scroll_step})")
                        await asyncio.sleep(random.uniform(0.8, 1.5)) # Human reading pause
 
                    # 🎯 CARD-BASED AI DISCOVERY WITH ROBUST FALLBACK
                    cards = await page.query_selector_all('div.g, div[data-ved]')
                    processed_card_leads = 0
 
                    if cards and len(cards) > 0:
                        logger.info(f"📋 Found {len(cards)} Google result cards. Starting card-based analysis...")
                        for card in cards:
                            if len(found_usernames) >= limit: break
                            
                            # Extract link
                            link_el = await card.query_selector('a[href*="instagram.com"]')
                            if not link_el:
                                continue
                            
                            href = await link_el.get_attribute('href')
                            if href and '/url?q=' in href: 
                                href = href.split('/url?q=')[1].split('&')[0]
                            
                            if href:
                                match = re.search(r'instagram\.com/([a-zA-Z0-9._]{3,30})', href)
                                if match:
                                    u = match.group(1).strip().strip('./_').lower()
                                    if self._is_valid_username(u) and u not in seen:
                                        processed_card_leads += 1
                                        
                                        # Extract title
                                        title_el = await card.query_selector('h3')
                                        title = await title_el.inner_text() if title_el else ""
                                        
                                        # Extract snippet
                                        snippet = await card.inner_text()
                                        if title and title in snippet:
                                            snippet = snippet.replace(title, "").strip()
 
                                        # Deep AI Filter logic
                                        if enable_ai_filter and google_niche_filter:
                                            msg = f"🧠 [AI Filter] Evaluating @{u} ({ai_model})..."
                                            logger.info(msg)
                                            try: await manager.send_personal_message({"type": "discovery_progress", "message": msg}, user_id)
                                            except: pass
                                            
                                            res = await self._analyze_google_result_sequential(
                                                title=title,
                                                url=href,
                                                snippet=snippet,
                                                criteria=google_niche_filter,
                                                model_choice=ai_model,
                                                api_key=minimax_api_key
                                            )
                                            
                                            is_match = res.get("match", False)
                                            reason = res.get("reason", "No reason provided.")
                                            
                                            if not is_match:
                                                msg = f"❌ [AI Filter] Skipped @{u} (Reason: {reason})"
                                                logger.info(msg)
                                                try: await manager.send_personal_message({"type": "discovery_progress", "message": msg}, user_id)
                                                except: pass
                                                
                                                try:
                                                    data_audit = {
                                                        "google_snippet_data": {
                                                            "title": title,
                                                            "url": href,
                                                            "snippet": snippet
                                                        },
                                                        "rejection_reason": reason,
                                                        "google_ai_analyzed": True,
                                                        "google_ai_match": False
                                                    }
                                                    if discovery_intent:
                                                        data_audit["discovery_intent"] = discovery_intent
                                                    
                                                    new_id = await db.fetchval(
                                                        "INSERT INTO instagram_leads (user_id, instagram_username, discovery_keyword, status, data_audit_json) "
                                                        "VALUES ($1, $2, $3, 'google_rejected', $4) "
                                                        "ON CONFLICT (user_id, instagram_username) DO UPDATE SET "
                                                        "status = CASE WHEN instagram_leads.status IN ('discovered', 'queued', 'pending_ai', 'qualified') THEN instagram_leads.status ELSE 'google_rejected' END, "
                                                        "data_audit_json = COALESCE(instagram_leads.data_audit_json, '{}'::jsonb) || EXCLUDED.data_audit_json, "
                                                        "discovery_keyword = EXCLUDED.discovery_keyword "
                                                        "RETURNING id",
                                                        user_id, u, keyword, json.dumps(data_audit)
                                                    )
                                                    if new_id:
                                                        try:
                                                            await manager.send_personal_message({
                                                                "type": "new_lead_discovered",
                                                                "lead_id": new_id,
                                                                "status": "google_rejected"
                                                            }, user_id)
                                                        except: pass
                                                except Exception as db_err:
                                                    logger.error(f"❌ Failed to insert google_rejected lead {u}: {db_err}")
                                                continue
                                            else:
                                                msg = f"✅ [AI Filter] MATCHED @{u} (Reason: {reason})"
                                                logger.info(msg)
                                                try: await manager.send_personal_message({"type": "discovery_progress", "message": msg}, user_id)
                                                except: pass
                                                
                                                # Mark the audit data so we don't repeat the AI filter later
                                                google_ai_data = {
                                                    "google_ai_analyzed": True,
                                                    "google_ai_match": True,
                                                    "google_ai_reason": reason
                                                }
                                        logger.info(f"✨ Approved Lead: @{u}")
                                        found_usernames.append(u)
                                        seen.add(u)
                                        
                                        # Save lead to database immediately in real-time!
                                        db_status = "discovered"
                                        try:
                                            data_audit = {
                                                "google_snippet_data": {
                                                    "title": title,
                                                    "url": href,
                                                    "snippet": snippet
                                                }
                                            }
                                            if enable_ai_filter and google_niche_filter:
                                                data_audit.update(google_ai_data)
                                            if discovery_intent:
                                                data_audit["discovery_intent"] = discovery_intent
                                            new_id = await db.fetchval(
                                                "INSERT INTO instagram_leads (user_id, instagram_username, discovery_keyword, status, data_audit_json) "
                                                "VALUES ($1, $2, $3, $4, $5) "
                                                "ON CONFLICT (user_id, instagram_username) DO UPDATE SET "
                                                "data_audit_json = COALESCE(instagram_leads.data_audit_json, '{}'::jsonb) || EXCLUDED.data_audit_json, "
                                                "discovery_keyword = EXCLUDED.discovery_keyword "
                                                "RETURNING id",
                                                user_id, u, keyword, db_status, json.dumps(data_audit)
                                            )
                                            if new_id:
                                                try:
                                                    await manager.send_personal_message({
                                                        "type": "new_lead_discovered",
                                                        "lead_id": new_id,
                                                        "status": db_status
                                                    }, user_id)
                                                except: pass
                                        except Exception as db_err:
                                            logger.error(f"❌ Failed to insert lead {u} in real-time: {db_err}")
 
                    # 🛡️ STEALTH FALLBACK: If card selector returned nothing, extract links and text snippet-style
                    if processed_card_leads == 0:
                        logger.warning("⚠️ Card-based selector found no leads. Using legacy regex fallback parser...")
                        # 💡 VISIBLE TEXT ONLY: Extract inner text rather than HTML code to completely avoid CSS stylesheet leakage
                        page_content = await page.evaluate("() => document.body.innerText")
                        
                        # 1. Scrape from Links
                        links = await page.query_selector_all('a[href*="instagram.com"]')
                        for link in links:
                            href = await link.get_attribute('href')
                            if href and '/url?q=' in href: href = href.split('/url?q=')[1].split('&')[0]
                            if href:
                                match = re.search(r'instagram\.com/([a-zA-Z0-9._]{3,30})', href)
                                if match:
                                    u = match.group(1).strip().strip('./_').lower()
                                    if self._is_valid_username(u) and u not in seen:
                                        logger.info(f"✨ Found Link Lead: @{u}")
                                        found_usernames.append(u)
                                        seen.add(u)
                                        
                                        # Save fallback link lead immediately!
                                        try:
                                            data_audit = {
                                                "google_snippet_data": {
                                                    "title": "",
                                                    "url": href,
                                                    "snippet": ""
                                                }
                                            }
                                            if discovery_intent:
                                                data_audit["discovery_intent"] = discovery_intent
                                            new_id = await db.fetchval(
                                                "INSERT INTO instagram_leads (user_id, instagram_username, discovery_keyword, status, data_audit_json) "
                                                "VALUES ($1, $2, $3, 'discovered', $4) "
                                                "ON CONFLICT (user_id, instagram_username) DO UPDATE SET "
                                                "data_audit_json = COALESCE(instagram_leads.data_audit_json, '{}'::jsonb) || EXCLUDED.data_audit_json, "
                                                "discovery_keyword = EXCLUDED.discovery_keyword "
                                                "RETURNING id",
                                                user_id, u, keyword, json.dumps(data_audit)
                                            )
                                            if new_id:
                                                try:
                                                    await manager.send_personal_message({
                                                        "type": "new_lead_discovered",
                                                        "lead_id": new_id,
                                                        "status": "discovered"
                                                    }, user_id)
                                                except: pass
                                        except Exception as db_err:
                                            logger.error(f"❌ Failed to insert fallback lead {u} in real-time: {db_err}")
 
                        # 2. Scrape from Text Snippets (Deep Scan)
                        snippets = re.findall(r'(?:@|instagram\.com/)([a-z0-9._]{3,30})', page_content.lower())
                        for u in snippets:
                            u = u.strip().strip('./_')
                            if self._is_valid_username(u) and u not in seen:
                                logger.info(f"✨ Found Snippet Lead: @{u}")
                                found_usernames.append(u)
                                seen.add(u)
                                
                                # Save fallback snippet lead immediately!
                                try:
                                    data_audit = {
                                        "google_snippet_data": {
                                            "title": "",
                                            "url": f"https://www.instagram.com/{u}/",
                                            "snippet": ""
                                        }
                                    }
                                    if discovery_intent:
                                        data_audit["discovery_intent"] = discovery_intent
                                    new_id = await db.fetchval(
                                         "INSERT INTO instagram_leads (user_id, instagram_username, discovery_keyword, status, data_audit_json) "
                                         "VALUES ($1, $2, $3, 'discovered', $4) "
                                         "ON CONFLICT (user_id, instagram_username) DO UPDATE SET "
                                         "data_audit_json = COALESCE(instagram_leads.data_audit_json, '{}'::jsonb) || EXCLUDED.data_audit_json, "
                                         "discovery_keyword = EXCLUDED.discovery_keyword "
                                         "RETURNING id",
                                         user_id, u, keyword, json.dumps(data_audit)
                                    )
                                    if new_id:
                                        try:
                                            await manager.send_personal_message({
                                                "type": "new_lead_discovered",
                                                "lead_id": new_id,
                                                "status": "discovered"
                                            }, user_id)
                                        except: pass
                                except Exception as db_err:
                                    logger.error(f"❌ Failed to insert snippet lead {u} in real-time: {db_err}")
                    
                    # Extra pause before next page
                    await asyncio.sleep(random.uniform(4, 7))
                    
                    # If we found nothing at all on this page, stop early
                    if processed_card_leads == 0 and len(links) < 5: 
                        break
                except Exception as e:
                    logger.error(f"❌ Google Scrape Error: {e}")
                    break

            await browser.close()
        
        logger.info(f"🎯 [ULTRA SURGE] Finished. Found {len(found_usernames)} unique Google leads.")
        return found_usernames[:limit]

    # --- Stage 2: Analysis ---

    # --- Data Utils ---
    
    # --- Universal Qualification Engine ---
    
    async def _qualify_and_update(self, lead_id: int, user_id: int, bio: str, followers: int, following: int, full_name: str, recent_posts: List[dict], is_private: bool = False):
        """Internal worker to analyze profile data and update lead status."""
        logger.info(f"📊 Analyzing @Lead {lead_id} (Followers: {followers}, Following: {following}), Bio: '{bio[:30]}...', Private: {is_private})")
        
        async def update_ui(action: str):
            try:
                await manager.send_personal_message({
                    "type": "instagram_lead_updated",
                    "lead_id": lead_id,
                    "status": "analyzing",
                    "current_action": action
                }, user_id)
            except: pass

        ai_analysis = {}
        score = 0
        
        # 🚨 NOT FOUND CHECK: Detect InstaCognito's "profile not available" messages
        not_found_phrases = [
            'we are downloading the profile',
            'downloading the profile. please wait',
            'the page was not found',
            'page was not found',
            'profile not found',
            'user not found',
            'this account doesn\'t exist',
            'no posts yet',
            'account not found',
            'sorry, this page isn\'t available',
        ]
        bio_lower = (bio or '').lower()
        if any(phrase in bio_lower for phrase in not_found_phrases):
            logger.warning(f"🚫 Lead {lead_id} shows a 'not found' page. Marking as 'error'.")
            await db.execute("UPDATE instagram_leads SET status = 'error', updated_at = NOW() WHERE id = $1", lead_id)
            return "error"
        
        # 🏎️ SAFETY CHECK - Only fail if we have absolutely NO data at all
        if not bio and followers == 0 and following == 0:
            logger.warning(f"⚠️ Lead {lead_id} has NO data. Marking as 'failed' for retry.")
            await db.execute("UPDATE instagram_leads SET status = 'failed', updated_at = NOW() WHERE id = $1", lead_id)
            return "failed"

        # 🔒 PRIVATE PROFILE: Save and exit immediately — no qualification needed
        if is_private:
            await db.execute("""
                UPDATE instagram_leads 
                SET status = 'private', bio = $1, follower_count = $2, following_count = $3, full_name = $4, recent_posts = '[]', is_private = TRUE, updated_at = NOW() 
                WHERE id = $5
            """, bio, followers, following, full_name, lead_id)
            logger.info(f"🔒 Lead {lead_id} marked as PRIVATE.")
            try:
                await manager.send_personal_message({"type": "instagram_lead_updated", "lead_id": lead_id, "status": "private"}, user_id)
            except: pass
            return "private"

        settings = await self.get_filter_settings(user_id)
        is_qualified = True
        rejection_reason = ""
        trace_steps = []
        
        # 1. Follower Count Match
        if settings['min_followers'] > 0 or settings['max_followers'] > 0:
            sub_qualified = True
            details_str = f"Found {followers:,} followers."
            if settings['min_followers'] > 0 and followers < settings['min_followers']:
                rejection_reason = f"Follower check failed: {followers} followers is below the minimum requirement of {settings['min_followers']}."
                logger.info(f"❌ Follower Filter rejected lead: {rejection_reason}")
                is_qualified = False
                sub_qualified = False
                details_str += f" Below min limit of {settings['min_followers']:,}."
            if is_qualified and settings['max_followers'] > 0 and followers > settings['max_followers']:
                rejection_reason = f"Follower check failed: {followers} followers is above the maximum limit of {settings['max_followers']}."
                logger.info(f"❌ Follower Filter rejected lead: {rejection_reason}")
                is_qualified = False
                sub_qualified = False
                details_str += f" Above max limit of {settings['max_followers']:,}."
            
            if sub_qualified:
                min_lbl = f"{settings['min_followers']:,}" if settings['min_followers'] > 0 else "0"
                max_lbl = f"{settings['max_followers']:,}" if settings['max_followers'] > 0 else "∞"
                details_str += f" Within allowed range ({min_lbl} - {max_lbl})."
            trace_steps.append({
                "step": "Follower Count Check",
                "status": "passed" if sub_qualified else "failed",
                "details": details_str
            })
        else:
            trace_steps.append({
                "step": "Follower Count Check",
                "status": "skipped",
                "details": f"No follower range criteria set. Profile has {followers:,} followers."
            })

        # 2. Exclude Bio Keyword Filter (Block list)
        bio_exclude = settings.get('bio_exclude_keywords', '')
        if bio_exclude and bio_exclude.strip():
            if not is_qualified:
                trace_steps.append({
                    "step": "Exclude Keyword Filter",
                    "status": "skipped",
                    "details": "Skipped because follower filter failed."
                })
            elif not bio:
                trace_steps.append({
                    "step": "Exclude Keyword Filter",
                    "status": "passed",
                    "details": "Profile bio is empty, so no exclude keywords matched."
                })
            else:
                exclude_kws = [k.strip().lower() for k in bio_exclude.split(',') if k.strip()]
                bio_lower = bio.lower()
                matched_kws = [kw for kw in exclude_kws if kw in bio_lower]
                if matched_kws:
                    rejection_reason = f"Bio contains a blacklisted keyword: '{matched_kws[0]}'."
                    logger.info(f"❌ Exclude Keyword Filter rejected lead: {rejection_reason}")
                    is_qualified = False
                    trace_steps.append({
                        "step": "Exclude Keyword Filter",
                        "status": "failed",
                        "details": f"Bio contains blacklisted keyword(s): {', '.join(matched_kws)}."
                    })
                else:
                    trace_steps.append({
                        "step": "Exclude Keyword Filter",
                        "status": "passed",
                        "details": "Bio does not contain any blacklisted keywords."
                    })
        else:
            trace_steps.append({
                "step": "Exclude Keyword Filter",
                "status": "skipped",
                "details": "No exclude keywords list set."
            })

        # 3. Cities Whitelist Filter (String check only, no AI)
        bio_cities = settings.get('bio_cities_whitelist', '')
        if bio_cities and bio_cities.strip():
            if not is_qualified:
                trace_steps.append({
                    "step": "Cities Whitelist Filter",
                    "status": "skipped",
                    "details": "Skipped because previous step failed."
                })
            else:
                cities_list = [c.strip().lower() for c in bio_cities.split(',') if c.strip()]
                # Fetch username from DB
                lead_row = await db.fetchrow("SELECT instagram_username FROM instagram_leads WHERE id = $1", lead_id)
                username_val = (lead_row['instagram_username'] if lead_row else '')
                username_lower = username_val.lower()
                full_name_lower = (full_name or '').lower()
                bio_lower_city = (bio or '').lower()

                # Fast string match only
                matched_cities = [city for city in cities_list if city in bio_lower_city or city in full_name_lower or city in username_lower]
                city_found_fast = len(matched_cities) > 0

                if city_found_fast:
                    logger.info(f"✅ Cities Filter PASSED (string match) for @{username_val}")
                    trace_steps.append({
                        "step": "Cities Whitelist Filter",
                        "status": "passed",
                        "details": f"Matches whitelist city: '{matched_cities[0]}'."
                    })
                else:
                    rejection_reason = "Location check failed: The profile does not match any city on your whitelist."
                    logger.info(f"❌ Cities Whitelist rejected @{username_val} (No AI Check).")
                    is_qualified = False
                    trace_steps.append({
                        "step": "Cities Whitelist Filter",
                        "status": "failed",
                        "details": f"Profile details did not match any of: {', '.join(cities_list)}."
                    })
        else:
            trace_steps.append({
                "step": "Cities Whitelist Filter",
                "status": "skipped",
                "details": "No cities whitelist criteria set."
            })

        # 4. Bio Keyword Match (Acts as a secondary booster or filter)
        if settings.get('bio_keywords'):
            if not is_qualified:
                trace_steps.append({
                    "step": "Bio Keyword Match",
                    "status": "skipped",
                    "details": "Skipped because previous step failed."
                })
            else:
                kw_match = self._check_bio_keywords(bio, settings['bio_keywords'])
                if not kw_match:
                    rejection_reason = "Keyword check failed: Profile bio does not contain any of your target search keywords."
                    logger.info(f"❌ Keyword Filter rejected lead: {rejection_reason}")
                    is_qualified = False
                    trace_steps.append({
                        "step": "Bio Keyword Match",
                        "status": "failed",
                        "details": f"Bio does not match target keywords: {settings['bio_keywords']}."
                    })
                else:
                    trace_steps.append({
                        "step": "Bio Keyword Match",
                        "status": "passed",
                        "details": f"Bio contains target search keyword(s)."
                    })
        else:
            trace_steps.append({
                "step": "Bio Keyword Match",
                "status": "skipped",
                "details": "No bio keyword criteria set."
            })

        # 5. 🧠 DEEP AI ANALYSIS
        ai_analysis = {}
        score = 0
        lead_row = await db.fetchrow("SELECT data_audit_json, instagram_username FROM instagram_leads WHERE id = $1", lead_id)
        existing_audit = json.loads(lead_row['data_audit_json'] or '{}') if (lead_row and lead_row['data_audit_json']) else {}
        intent_description = existing_audit.get('discovery_intent', '') or settings.get('ai_intent_filter', '')
        
        if not is_qualified:
            trace_steps.append({
                "step": "Deep AI Intent Check",
                "status": "skipped",
                "details": "Skipped because previous step failed."
            })
        elif not intent_description or not intent_description.strip():
            trace_steps.append({
                "step": "Deep AI Intent Check",
                "status": "skipped",
                "details": "Skipped because no Target Lead Intent description was set."
            })
        else:
            selected_model = settings.get('ai_model') or 'gemma4'
            await update_ui(f"AI ({selected_model}): Analyzing Bio & Intent...")
            username_val = lead_row['instagram_username'] if lead_row else "unknown"
            logger.info(f"🧠 [{selected_model}] Analyzing @{username_val}...")
            ai_result = await instagram_ai.analyze_lead_deep({
                "username": username_val,
                "bio": bio,
                "followers": followers
            }, model_choice=selected_model, intent_description=intent_description, api_key=settings.get('minimax_api_key', ''))
            
            if ai_result and "error" not in ai_result:
                ai_analysis.update(ai_result)
                score = ai_result.get("intent_score", 0)
                if ai_result.get("quality") == "high":
                    score = max(score, 90)
                logger.info(f"✨ [AI] Analysis Complete. Score: {score}, Niche: {ai_result.get('niche')}")
                
                # Check AI Score
                if score < 70:
                    rejection_reason = f"Low intent score: Gemma intent match score is only {score}% (below 70%). Analysis strategy details: '{ai_analysis.get('strategy', 'No reason given')}'"
                    logger.info(f"❌ AI Rejected lead: {rejection_reason}")
                    is_qualified = False
                    trace_steps.append({
                        "step": "Deep AI Intent Check",
                        "status": "failed",
                        "details": f"Intent match score {score}% is below required 70%. Model: {selected_model}. Reason: {ai_analysis.get('strategy', 'No reason given')}"
                    })
                else:
                    trace_steps.append({
                        "step": "Deep AI Intent Check",
                        "status": "passed",
                        "details": f"Intent match score {score}% meets/exceeds 70%. Model: {selected_model}. Reason: {ai_analysis.get('strategy', 'No reason given')}"
                    })
            else:
                err_msg = ai_result.get('error', 'Unknown Error') if ai_result else 'Unknown Error'
                logger.warning(f"⚠️ AI was unavailable or returned error: {err_msg}")
                rejection_reason = f"AI Analysis failed: {err_msg}"
                is_qualified = False
                trace_steps.append({
                    "step": "Deep AI Intent Check",
                    "status": "failed",
                    "details": f"AI Engine returned error: {err_msg}"
                })

        # 6. Visual Match Filter (Only if enabled)
        visual_niche = settings.get('visual_niche', '')
        target_hashes = settings.get('sample_hashes', [])
        if visual_niche or target_hashes:
            if not is_qualified:
                trace_steps.append({
                    "step": "Visual Match Filter",
                    "status": "skipped",
                    "details": "Skipped because previous step failed."
                })
            elif not recent_posts:
                reason = "Visual scanner failed: Profile has no photos to scan."
                logger.info(f"❌ {reason}")
                is_qualified = False
                ai_analysis['vision_reason'] = reason
                rejection_reason = reason
                trace_steps.append({
                    "step": "Visual Match Filter",
                    "status": "failed",
                    "details": reason
                })
            else:
                image_matched = False
                vision_res = {}
                # Try AI Vision FIRST if niche is described
                if visual_niche:
                    await update_ui(f"AI Vision: Scanning for '{visual_niche}'...")
                    logger.info(f"👁️ AI VISION ACTIVE: Checking photos for '{visual_niche}'...")
                    async with httpx.AsyncClient(timeout=20.0) as client:
                        for post in recent_posts[:2]:
                            try:
                                img_b64 = None
                                # Prefer pre-captured b64 screenshot — avoids blocked Instagram CDN
                                if isinstance(post, dict) and post.get('b64_data'):
                                    logger.info("📸 Using pre-captured screenshot base64 for vision check.")
                                    img_b64 = post['b64_data']
                                elif isinstance(post, dict) and post.get('display_url'):
                                    logger.info(f"🌐 Fetching post URL via HTTP: {post.get('display_url', '')[:60]}...")
                                    res = await client.get(post['display_url'])
                                    if res.status_code == 200:
                                        import base64
                                        img_b64 = base64.b64encode(res.content).decode('utf-8')
                                
                                if img_b64:
                                    vision_res = await instagram_ai.analyze_vision(img_b64, visual_niche)
                                    if vision_res.get('match'):
                                        reason = vision_res.get('reason', 'Visual match confirmed.')
                                        logger.info(f"✅ AI Vision Match: {reason}")
                                        image_matched = True
                                        ai_analysis['vision_reason'] = reason
                                        break
                                    else:
                                        logger.info(f"❌ AI Vision Mismatch: {vision_res.get('reason', '')}")
                                else:
                                    logger.warning(f"⚠️ No image data available for post (no b64_data or display_url)")
                            except Exception as e:
                                logger.warning(f"⚠️ AI Vision post check failed: {e}")

                
                # Fallback to Math Hashing if AI didn't confirm (or wasn't used)
                if not image_matched and target_hashes:
                    logger.info("🔍 Hashing Fallback: Checking structural match...")
                    try:
                        async with httpx.AsyncClient(timeout=10.0) as client:
                            for post in recent_posts:
                                try:
                                    res = await client.get(post['display_url'])
                                    if res.status_code == 200:
                                        post_hash = await asyncio.get_event_loop().run_in_executor(None, self._get_image_hash, res.content)
                                        if post_hash:
                                            import imagehash
                                            p_hashes = post_hash.split('|')
                                            for target_hash in target_hashes:
                                                t_hashes = target_hash.split('|')
                                                if len(p_hashes) == 2 and len(t_hashes) == 2:
                                                    p_obj1, p_obj2 = imagehash.hex_to_hash(p_hashes[0]), imagehash.hex_to_hash(p_hashes[1])
                                                    t_obj1, t_obj2 = imagehash.hex_to_hash(t_hashes[0]), imagehash.hex_to_hash(t_hashes[1])
                                                    if (p_obj1 - t_obj1) <= 32 and (p_obj2 - t_obj2) <= 38:
                                                        image_matched = True
                                                        break
                                                else:
                                                    if (imagehash.hex_to_hash(p_hashes[0]) - imagehash.hex_to_hash(t_hashes[0])) <= 26:
                                                        image_matched = True
                                                        break
                                except: pass
                                if image_matched: break
                    except: pass
                
                if not image_matched:
                    reason = vision_res.get('reason', 'No photos matched the target criteria') if visual_niche else 'No structural match found'
                    logger.info(f"❌ Visual Check rejected lead: {reason}")
                    is_qualified = False
                    ai_analysis['vision_reason'] = reason
                    rejection_reason = f"Visual check failed: {reason}"
                    trace_steps.append({
                        "step": "Visual Match Filter",
                        "status": "failed",
                        "details": reason
                    })
                else:
                    v_reason = ai_analysis.get('vision_reason', 'Visual match confirmed.')
                    trace_steps.append({
                        "step": "Visual Match Filter",
                        "status": "passed",
                        "details": v_reason
                    })
        else:
            trace_steps.append({
                "step": "Visual Match Filter",
                "status": "skipped",
                "details": "No visual criteria or sample hashes set."
            })

        # Attach filter trace to the AI analysis dict so it gets saved to data_audit_json in DB
        ai_analysis['filter_trace'] = trace_steps

        if not is_qualified and rejection_reason:
            ai_analysis['rejection_reason'] = rejection_reason

        new_status = 'qualified' if is_qualified else 'rejected'
        
        # 🏎️ SAVE EVERYTHING: Full Name, Bio, Followers, Posts, and AI Data
        posts_json = json.dumps(recent_posts or [])
        ai_data_json = json.dumps(ai_analysis)
        
        logger.info(f"💾 [DB] Saving Lead {lead_id} with Score {score} and AI Data...")
        
        await db.execute("""
            UPDATE instagram_leads 
            SET status = $1, bio = $2, follower_count = $3, following_count = $4, full_name = $5, 
                recent_posts = $6, is_private = $7, score = $8, data_audit_json = $9, updated_at = NOW() 
            WHERE id = $10
        """, new_status, bio, followers, following, full_name, posts_json, is_private, score, ai_data_json, lead_id)
        
        logger.info(f"✨ Lead {lead_id} fully saved as: {new_status.upper()}")
        
        # 🏎️💨 INSTANT UI FLASH: Tell the frontend to refresh THIS lead immediately!
        try:
            await manager.send_personal_message({
                "type": "instagram_lead_updated",
                "lead_id": lead_id,
                "status": new_status,
                "current_action": "Analysis Complete"
            }, user_id)
        except: pass
        
        return new_status

    def _parse_account_str(self, a_str: str):
        """Parses username|password|2fa|session|uid|email bundle."""
        if not a_str: return None
        # Clean from tabs (if copied from table)
        a_str = a_str.split('\t')[0].strip()
        parts = [p.strip() for p in a_str.split('|')]
        data = {
            "username": parts[0],
            "password": parts[1] if len(parts) > 1 else "",
            "two_factor_secret": parts[2] if len(parts) > 2 else None,
            "session_id": None,
            "user_id_cookie": None,
            "email": parts[4] if len(parts) > 4 else None
        }
        # Parse cookies if present
        if len(parts) > 3:
            cookies = parts[3]
            # Common formats: ds_user_id=...;sessionid=...;
            sid = re.search(r'sessionid=([^; ]+)', cookies)
            uid = re.search(r'ds_user_id=([^; ]+)', cookies)
            if sid: data["session_id"] = sid.group(1)
            if uid: data["user_id_cookie"] = uid.group(1)
        return data

    async def analyze_lead(self, user_id: int, lead_id: int):
        # 1. Fetch user proxies to rotate / check
        proxies = []
        try:
            rows = await db.fetch("SELECT host, port, username, password FROM instagram_proxies WHERE user_id = $1 AND is_working = TRUE", user_id)
            proxies = [dict(r) for r in rows]
        except Exception as p_err:
            logger.warning(f"Failed to fetch proxies: {p_err}")

        proxy = None
        if proxies:
            p_row = random.choice(proxies)
            proxy = {
                "host": p_row["host"],
                "port": p_row["port"],
                "p_user": p_row["username"],
                "p_pass": p_row["password"]
            }

        # Step 1: Scrape & Pre-Filter
        step1_res = await self.scrape_and_pre_filter_lead(user_id, lead_id, proxy=proxy)
        if not step1_res.get("success"):
            return {"error": "Analysis Failed", "status": "failed"}

        status = step1_res.get("status")
        if status == "pending_ai":
            # Step 2: AI Analysis
            step2_res = await self.run_sequential_ai_analysis(user_id, lead_id)
            if step2_res.get("success"):
                return {"success": True, "new_status": step2_res.get("new_status"), "source": "anonymous_playwright"}
            else:
                return {"error": "AI Analysis Failed", "status": "error"}
        
        return {"success": True, "new_status": status, "source": "anonymous_playwright"}

    async def scrape_and_pre_filter_lead(self, user_id: int, lead_id: int, proxy: dict = None):
        """
        Step 1: Scrapes profile anonymously (using a proxy if provided) and runs non-AI pre-filters.
        Sets status to 'pending_ai' if qualified, or 'rejected' if disqualified, or 'private'/'error'/'failed'.
        """
        lead = await db.fetchrow("SELECT instagram_username FROM instagram_leads WHERE id = $1 AND user_id = $2", lead_id, user_id)
        if not lead: return {"error": "Lead not found"}
        username = lead['instagram_username']

        async def update_ui(status: str, action: str = None):
            try:
                await manager.send_personal_message({
                    "type": "instagram_lead_updated",
                    "lead_id": lead_id,
                    "status": status,
                    "current_action": action
                }, user_id)
            except: pass

        await update_ui("analyzing", "Scraping profile details...")

        try:
            logger.info(f"🕶️ Phase 1 Scraping: Capturing @{username}...")
            result = await browser_engine.run_anonymous_session(
                username,
                self._perform_anonymous_analysis,
                headless=False,
                proxy=proxy
            )

            if not result or not result.get('success'):
                logger.warning(f"⚠️ Scraping failed for @{username}. Deleting from DB.")
                await db.execute("DELETE FROM instagram_leads WHERE id = $1", lead_id)
                await update_ui("failed", "Scraping failed (Deleted)")
                return {"success": False, "status": "failed"}

            bio = result.get('bio', '')
            followers = result.get('followers', 0)
            following = result.get('following', 0)
            full_name = result.get('full_name', username)
            posts = result.get('posts', [])
            is_private = result.get('is_private', False)

            # Not found check
            not_found_phrases = [
                'we are downloading the profile',
                'downloading the profile. please wait',
                'the page was not found',
                'page was not found',
                'profile not found',
                'user not found',
                'this account doesn\'t exist',
                'no posts yet',
                'account not found',
                'sorry, this page isn\'t available',
            ]
            bio_lower = bio.lower()
            if any(phrase in bio_lower for phrase in not_found_phrases):
                logger.warning(f"🚫 Lead {lead_id} shows a 'not found' page. Marking as 'error'.")
                await db.execute("UPDATE instagram_leads SET status = 'error', updated_at = NOW() WHERE id = $1", lead_id)
                await update_ui("error", "Profile not found")
                return {"success": True, "status": "error"}

            # Safety check
            if not bio and followers == 0 and following == 0:
                logger.warning(f"⚠️ Lead {lead_id} has NO data. Deleting from DB.")
                await db.execute("DELETE FROM instagram_leads WHERE id = $1", lead_id)
                await update_ui("failed", "No data scraped (Deleted)")
                return {"success": False, "status": "failed"}

            # Handle private profile immediately
            if is_private:
                await db.execute("""
                    UPDATE instagram_leads 
                    SET status = 'private', bio = $1, follower_count = $2, following_count = $3, full_name = $4, recent_posts = '[]', is_private = TRUE, updated_at = NOW() 
                    WHERE id = $5
                """, bio, followers, following, full_name, lead_id)
                logger.info(f"🔒 Lead {lead_id} marked as PRIVATE.")
                await update_ui("private", "Private account")
                return {"success": True, "status": "private"}

            # Run non-AI filters
            settings = await self.get_filter_settings(user_id)
            is_qualified, rejection_reason = self._check_non_ai_filters(bio, followers, full_name, username, settings)

            trace_steps = self._generate_pre_filter_trace(settings, bio, followers, full_name, username)
            posts_json = json.dumps(posts or [])
            if not is_qualified:
                ai_analysis = {"rejection_reason": rejection_reason, "filter_trace": trace_steps}
                ai_data_json = json.dumps(ai_analysis)
                await db.execute("""
                    UPDATE instagram_leads 
                    SET status = 'rejected', bio = $1, follower_count = $2, following_count = $3, full_name = $4, 
                        recent_posts = $5, is_private = FALSE, score = 0, data_audit_json = $6, updated_at = NOW() 
                    WHERE id = $7
                """, bio, followers, following, full_name, posts_json, ai_data_json, lead_id)
                logger.info(f"❌ Lead {lead_id} rejected by pre-filters: {rejection_reason}")
                await update_ui("rejected", rejection_reason)
                return {"success": True, "status": "rejected", "rejection_reason": rejection_reason}

            # Passed pre-filters -> set status to pending_ai
            ai_analysis = {"filter_trace": trace_steps}
            ai_data_json = json.dumps(ai_analysis)
            await db.execute("""
                UPDATE instagram_leads 
                SET status = 'pending_ai', bio = $1, follower_count = $2, following_count = $3, full_name = $4, 
                    recent_posts = $5, is_private = FALSE, data_audit_json = $6, updated_at = NOW() 
                WHERE id = $7
            """, bio, followers, following, full_name, posts_json, ai_data_json, lead_id)
            logger.info(f"⏳ Lead {lead_id} passed pre-filters. Marked as pending_ai.")
            await update_ui("pending_ai", "Passed pre-filters, waiting for AI...")
            return {"success": True, "status": "pending_ai"}

        except Exception as e:
            logger.error(f"⚠️ Scraping phase failed for @{username}: {e}")
            await db.execute("DELETE FROM instagram_leads WHERE id = $1", lead_id)
            await update_ui("failed", str(e))
            return {"success": False, "status": "failed", "error": str(e)}

    async def run_sequential_ai_analysis(self, user_id: int, lead_id: int):
        """
        Step 2: Processes AI analysis sequentially for a single lead.
        Reads scraped data from the database, queries AI, runs visual verification, and marks as 'qualified' or 'rejected'.
        """
        lead = await db.fetchrow("SELECT instagram_username, bio, follower_count, following_count, full_name, recent_posts, is_private, data_audit_json FROM instagram_leads WHERE id = $1 AND user_id = $2", lead_id, user_id)
        if not lead: return {"error": "Lead not found"}
        from app.features.instagram_scraper.ai_engine import instagram_ai

        username = lead['instagram_username']
        bio = lead['bio']
        followers = lead['follower_count'] or 0
        following = lead['following_count'] or 0
        full_name = lead['full_name']
        recent_posts = json.loads(lead['recent_posts'] or '[]')
        is_private = lead['is_private']
        # Preserve the pre-filter trace that was saved by scrape_and_pre_filter_lead
        existing_audit = json.loads(lead['data_audit_json'] or '{}') if lead['data_audit_json'] else {}
        pre_filter_trace = existing_audit.get('filter_trace', [])

        async def update_ui(status: str, action: str = None):
            try:
                await manager.send_personal_message({
                    "type": "instagram_lead_updated",
                    "lead_id": lead_id,
                    "status": status,
                    "current_action": action
                }, user_id)
            except: pass

        await update_ui("analyzing", "Running AI Intent Analysis...")

        settings = await self.get_filter_settings(user_id)
        is_qualified = True
        rejection_reason = ""
        ai_analysis = {}
        score = 0
        ai_trace_steps = []

        # 1. 🔍 DEEP AI SEARCH RESULT FILTER
        selected_model = settings.get('ai_model') or 'gemma4'
        
        # Setup fallback models list
        cloud_fallbacks = ["gemini", "groq", "huggingface", "minimax-text-01"]
        models_to_try = [selected_model]
        for m in cloud_fallbacks:
            if not any(m in x.lower() for x in models_to_try):
                models_to_try.append(m)

        if not is_qualified:
            ai_trace_steps.append({
                "step": "Deep AI Search Result Filter",
                "status": "skipped",
                "details": "Skipped because previous step failed."
            })
        elif not settings.get('enable_ai_filter'):
            ai_trace_steps.append({
                "step": "Deep AI Search Result Filter",
                "status": "skipped",
                "details": "Skipped because Deep AI Search Result Filter is not enabled in settings."
            })
        else:
            google_data = existing_audit.get('google_snippet_data', {})
            title = google_data.get('title')
            url = google_data.get('url')
            snippet = google_data.get('snippet')
            google_niche_filter = settings.get('google_niche_filter', '')
            res = None
            step_prefix = ""
            
            if existing_audit.get('google_ai_analyzed') and existing_audit.get('google_ai_match'):
                logger.info(f"⚡ Reusing previous Google AI Match result for @{username}.")
                res = {
                    "match": True,
                    "reason": existing_audit.get('google_ai_reason', 'Matched criteria.')
                }
            elif not google_niche_filter or not google_niche_filter.strip():
                ai_trace_steps.append({
                    "step": "Deep AI Search Result Filter",
                    "status": "skipped",
                    "details": "Skipped because no Target Lead Criteria Description was set."
                })
            else:
                is_fallback = False
                if not title and not snippet:
                    is_fallback = True
                    title = f"Instagram Profile: {full_name or username}"
                    post_caps = [p.get('caption', '') for p in recent_posts if isinstance(p, dict) and p.get('caption')]
                    posts_text = " | ".join(post_caps[:3])
                    snippet = f"Bio: {bio or ''}\nRecent Posts: {posts_text}"

                if not title or not title.strip():
                    ai_trace_steps.append({
                        "step": "Deep AI Search Result Filter",
                        "status": "skipped",
                        "details": "Skipped because no Google search snippet data or Instagram profile text was found for this lead."
                    })
                else:
                    import random
                    last_err = None
                    used_model = selected_model
                    for model in models_to_try:
                        try:
                            # Delay only if calling a cloud model
                            if any(x in model.lower() for x in ["gemini", "groq", "openrouter", "huggingface", "hf", "minimax"]):
                                sleep_time = random.uniform(5.0, 6.0)
                                logger.info(f"⏳ Sleeping {sleep_time:.2f}s before calling cloud model {model}...")
                                await asyncio.sleep(sleep_time)
                            
                            step_prefix = ""
                            await update_ui("analyzing", "Running Deep AI Search Result Filter...")
                            res = await self._analyze_google_result_sequential(
                                title=title,
                                url=url or f"https://www.instagram.com/{username}/",
                                snippet=snippet,
                                criteria=google_niche_filter,
                                model_choice=model,
                                api_key=settings.get('minimax_api_key', '')
                            )
                            if res and "error" not in res:
                                used_model = model
                                break
                            else:
                                last_err = res.get("error", "Unknown error")
                                logger.warning(f"⚠️ Search Result Filter failed on {model}: {last_err}. Trying fallback...")
                        except Exception as e:
                            last_err = str(e)
                            logger.warning(f"⚠️ Search Result Filter exception on {model}: {last_err}. Trying fallback...")

            if res is not None:
                if "error" in res:
                    logger.error(f"❌ Deep AI Search Result Filter error: {res.get('error')}")
                    is_qualified = False
                    ai_trace_steps.append({
                        "step": "Deep AI Search Result Filter",
                        "status": "failed",
                        "details": f"AI Engine returned error: {res.get('error')}"
                    })
                else:
                    is_match = res.get("match", False)
                    reason = res.get("reason", "No reason provided.")
                    
                    if not is_match:
                        rejection_reason = f"Deep AI Search Result Filter mismatch: {reason}"
                        logger.info(f"❌ Deep AI Search Result Filter Rejected lead: {rejection_reason}")
                        is_qualified = False
                        ai_trace_steps.append({
                            "step": "Deep AI Search Result Filter",
                            "status": "failed",
                            "details": f"{step_prefix}{reason}"
                        })
                    else:
                        ai_trace_steps.append({
                            "step": "Deep AI Search Result Filter",
                            "status": "passed",
                            "details": f"{step_prefix}{reason}"
                        })

        # 2. 🧠 DEEP AI INTENT ANALYSIS
        logger.info(f"🧠 [{selected_model}] AI Analysis for @{username}...")
        
        try:
            intent_description = existing_audit.get('discovery_intent', '') or settings.get('ai_intent_filter', '')
            if not is_qualified:
                ai_trace_steps.append({
                    "step": "Deep AI Intent Check",
                    "status": "skipped",
                    "details": "Skipped because previous step failed."
                })
            elif not intent_description or not intent_description.strip():
                ai_trace_steps.append({
                    "step": "Deep AI Intent Check",
                    "status": "skipped",
                    "details": "Skipped because no Target Lead Intent description was set."
                })
            else:
                import random
                ai_result = None
                last_err = None
                used_model = selected_model
                for model in models_to_try:
                    try:
                        # Delay only if calling a cloud model
                        if any(x in model.lower() for x in ["gemini", "groq", "openrouter", "huggingface", "hf", "minimax"]):
                            sleep_time = random.uniform(5.0, 6.0)
                            logger.info(f"⏳ Sleeping {sleep_time:.2f}s before calling cloud model {model} for Intent Check...")
                            await asyncio.sleep(sleep_time)

                        ai_result = await instagram_ai.analyze_lead_deep({
                            "username": username,
                            "bio": bio,
                            "followers": followers
                        }, model_choice=model, intent_description=intent_description, api_key=settings.get('minimax_api_key', ''))
                        
                        if ai_result and "error" not in ai_result:
                            used_model = model
                            break
                        else:
                            last_err = ai_result.get("error", "Unknown error") if ai_result else "Unknown error"
                            logger.warning(f"⚠️ Intent Check failed on {model}: {last_err}. Trying fallback...")
                    except Exception as e:
                        last_err = str(e)
                        logger.warning(f"⚠️ Intent Check exception on {model}: {last_err}. Trying fallback...")

                if not ai_result or "error" in ai_result:
                    logger.warning(f"⚠️ AI was unavailable or returned error: {last_err}")
                    is_qualified = False
                    ai_trace_steps.append({
                        "step": "Deep AI Intent Check",
                        "status": "failed",
                        "details": f"AI Engine returned error: {last_err}"
                    })
                else:
                    ai_analysis.update(ai_result)
                    score = ai_result.get("intent_score", 0)
                    if ai_result.get("quality") == "high":
                        score = max(score, 90)
                    logger.info(f"✨ [{used_model}] Analysis Complete. Score: {score}, Niche: {ai_result.get('niche')}")

                    if score < 70:
                        rejection_reason = f"Low intent score: {used_model} intent match score is only {score}% (below 70%). Analysis strategy details: '{ai_analysis.get('strategy', 'No reason given')}'"
                        logger.info(f"❌ AI Rejected lead: {rejection_reason}")
                        is_qualified = False
                        ai_trace_steps.append({
                            "step": "Deep AI Intent Check",
                            "status": "failed",
                            "details": f"Intent match score {score}% is below required 70%. Model: {used_model}. Reason: {ai_analysis.get('strategy', 'No reason given')}"
                        })
                    else:
                        ai_trace_steps.append({
                            "step": "Deep AI Intent Check",
                            "status": "passed",
                            "details": f"Intent match score {score}% meets/exceeds 70%. Model: {used_model}. Reason: {ai_analysis.get('strategy', 'No reason given')}"
                        })
        except Exception as ai_err:
            logger.error(f"❌ AI analysis error: {ai_err}")
            ai_trace_steps.append({
                "step": "Deep AI Intent Check",
                "status": "failed",
                "details": f"AI analysis exception: {ai_err}"
            })

        # 3. Visual Match Filter (Only if enabled)
        visual_niche = settings.get('visual_niche', '')
        target_hashes = settings.get('sample_hashes', [])
        if visual_niche or target_hashes:
            if not is_qualified:
                pass  # Skipped from trace
            elif not recent_posts:
                reason = "Visual scanner failed: Profile has no photos to scan."
                logger.info(f"❌ {reason}")
                is_qualified = False
                ai_analysis['vision_reason'] = reason
                rejection_reason = reason
            else:
                image_matched = False
                vision_res = {}
                import httpx
                # Try AI Vision FIRST if niche is described
                if visual_niche:
                    await update_ui("analyzing", f"AI Vision: Scanning for '{visual_niche}'...")
                    logger.info(f"👁️ AI VISION ACTIVE: Checking photos for '{visual_niche}'...")
                    async with httpx.AsyncClient(timeout=20.0) as client:
                        for post in recent_posts[:2]:
                            try:
                                img_b64 = None
                                if isinstance(post, dict) and post.get('b64_data'):
                                    raw_b64 = post['b64_data']
                                    # Guard: skip if base64 is too small (< 5000 chars ≈ 3.7KB) — likely a blurred placeholder
                                    if len(raw_b64) < 5000:
                                        logger.warning(f"  ⚠️ b64_data too small ({len(raw_b64)} chars) — skipping placeholder image")
                                    else:
                                        logger.info(f"📸 Using pre-captured screenshot base64 ({len(raw_b64)} chars) for vision check.")
                                        img_b64 = raw_b64
                                elif isinstance(post, dict) and post.get('display_url'):
                                    logger.info(f"🌐 Fetching post URL via HTTP: {post.get('display_url', '')[:60]}...")
                                    try:
                                        res = await client.get(post['display_url'])
                                        if res.status_code == 200 and len(res.content) > 5000:
                                            import base64
                                            img_b64 = base64.b64encode(res.content).decode('utf-8')
                                        else:
                                            logger.warning(f"  ⚠️ HTTP image too small or failed ({res.status_code})")
                                    except Exception as fetch_err:
                                        logger.warning(f"  ⚠️ HTTP fetch failed: {fetch_err}")

                                if img_b64:
                                    vision_res = await instagram_ai.analyze_vision(img_b64, visual_niche)
                                    if vision_res.get('match'):
                                        reason = vision_res.get('reason', 'Visual match confirmed.')
                                        logger.info(f"✅ AI Vision Match: {reason}")
                                        image_matched = True
                                        ai_analysis['vision_reason'] = reason
                                        break
                                    else:
                                        logger.info(f"❌ AI Vision Mismatch: {vision_res.get('reason', '')}")
                                else:
                                    logger.warning(f"  ⚠️ No usable image data for post — skipping")
                            except Exception as e:
                                logger.warning(f"⚠️ AI Vision post check failed: {e}")

                # Fallback to Math Hashing if AI didn't confirm (or wasn't used)
                if not image_matched and target_hashes:
                    logger.info("🔍 Hashing Fallback: Checking structural match...")
                    try:
                        async with httpx.AsyncClient(timeout=10.0) as client:
                            for post in recent_posts:
                                try:
                                    res = await client.get(post['display_url'])
                                    if res.status_code == 200:
                                        post_hash = await asyncio.get_event_loop().run_in_executor(None, self._get_image_hash, res.content)
                                        if post_hash:
                                            import imagehash
                                            p_hashes = post_hash.split('|')
                                            for target_hash in target_hashes:
                                                t_hashes = target_hash.split('|')
                                                if len(p_hashes) == 2 and len(t_hashes) == 2:
                                                    p_obj1, p_obj2 = imagehash.hex_to_hash(p_hashes[0]), imagehash.hex_to_hash(p_hashes[1])
                                                    t_obj1, t_obj2 = imagehash.hex_to_hash(t_hashes[0]), imagehash.hex_to_hash(t_hashes[1])
                                                    if (p_obj1 - t_obj1) <= 32 and (p_obj2 - t_obj2) <= 38:
                                                        image_matched = True
                                                        break
                                                else:
                                                    if (imagehash.hex_to_hash(p_hashes[0]) - imagehash.hex_to_hash(t_hashes[0])) <= 26:
                                                        image_matched = True
                                                        break
                                except: pass
                                if image_matched: break
                    except: pass

                if not image_matched:
                    reason = vision_res.get('reason', 'No photos matched the target criteria') if visual_niche else 'No structural match found'
                    logger.info(f"❌ Visual Check rejected lead: {reason}")
                    is_qualified = False
                    ai_analysis['vision_reason'] = reason
                    rejection_reason = f"Visual check failed: {reason}"

        if not is_qualified and rejection_reason:
            ai_analysis['rejection_reason'] = rejection_reason

        # Construct/find the Google AI Search step
        google_ai_step = None
        for step in ai_trace_steps:
            if step.get("step") == "Deep AI Search Result Filter":
                google_ai_step = step
                break
        if not google_ai_step:
            for step in pre_filter_trace:
                if step.get("step") == "Deep AI Search Result Filter":
                    google_ai_step = step
                    break
        
        # If not found but we did analyze it (e.g. from audit), construct one
        if not google_ai_step and (existing_audit.get('google_ai_analyzed') or existing_audit.get('google_ai_match') is not None):
            is_match = existing_audit.get('google_ai_match', False)
            reason = existing_audit.get('google_ai_reason', 'Matched criteria.')
            google_ai_step = {
                "step": "Deep AI Search Result Filter",
                "status": "passed" if is_match else "failed",
                "details": f"Passed (Google AI Match: {reason})" if is_match else f"Failed: {reason}"
            }

        # Filter out Google AI step from pre_filter_trace and remaining_ai_steps to avoid duplicates
        clean_pre_trace = [s for s in pre_filter_trace if s.get("step") != "Deep AI Search Result Filter"]
        clean_ai_trace = [s for s in ai_trace_steps if s.get("step") != "Deep AI Search Result Filter"]
        
        if google_ai_step:
            full_trace = [google_ai_step] + clean_pre_trace + clean_ai_trace
        else:
            full_trace = clean_pre_trace + clean_ai_trace
            
        ai_analysis['filter_trace'] = full_trace

        new_status = 'qualified' if is_qualified else 'rejected'
        ai_data_json = json.dumps(ai_analysis)

        logger.info(f"💾 [DB] Saving Lead {lead_id} with AI results. Status: {new_status.upper()}")
        await db.execute("""
            UPDATE instagram_leads 
            SET status = $1, score = $2, data_audit_json = $3, updated_at = NOW() 
            WHERE id = $4
        """, new_status, score, ai_data_json, lead_id)

        await update_ui(new_status, "Analysis Complete")
        return {"success": True, "new_status": new_status}

    async def _perform_anonymous_analysis(self, page, username: str):
        """
        🕵️‍♂️ DEEP PROFILE ANALYSIS
        Wait for bio, scroll for posts, and capture everything.
        """
        try:
            url = f"https://www.instagram.com/{username}/"
            logger.info(f"🚀 Opening profile: {url}")
            await page.goto(url, wait_until="domcontentloaded")
            
            # 1. Wait for Profile to load (Smart Watchdog)
            logger.info("⏳ Waiting for profile header to appear...")
            try:
                # Wait for header or main content area
                await page.wait_for_selector("header, section", timeout=30000)
                logger.info("✅ Header detected!")
            except:
                logger.warning("⚠️ Header not detected after 30s, proceeding anyway...")
            
            await asyncio.sleep(5) # Final settle
            
            # 2. Human Scroll (Triggers post loading)
            logger.info("⏬ Scrolling profile to see posts...")
            for _ in range(2):
                await page.evaluate("window.scrollBy(0, 500)")
                await asyncio.sleep(random.uniform(1.0, 2.0))
            
            # 2.5 Wait for Posts Grid (Smart Watchdog)
            logger.info("⏳ Waiting for posts grid to pop up...")
            try:
                # Wait for the post grid/articles
                await page.wait_for_selector("article, div[role='button']", timeout=30000)
                logger.info("✅ Posts detected!")
            except:
                logger.warning("⚠️ Posts grid not detected after 30s...")

            await asyncio.sleep(5) # Final deep breath
            
            # 3. Extract Data
            content = await page.content()
            
            # Use regex for stats (more reliable in anonymous mode)
            followers = 0
            following = 0
            posts_count = 0
            is_private = False
            
            # Search for stats in JSON or Text
            stats_match = re.search(r'"edge_followed_by":{"count":(\d+)}', content)
            if stats_match: followers = int(stats_match.group(1))
            
            follow_match = re.search(r'"edge_follow":{"count":(\d+)}', content)
            if follow_match: following = int(follow_match.group(1))

            # 🛠️ ROBUST FALLBACK: Parse from meta description tag if stats returned 0
            if followers == 0 or following == 0:
                desc_match = re.search(r'<meta[^>]*content="([^"]*Followers, [^"]*Following[^"]*)"', content, re.IGNORECASE)
                if not desc_match:
                    desc_match = re.search(r'<meta[^>]*property="og:description"[^>]*content="([^"]*)"', content, re.IGNORECASE)
                
                if desc_match:
                    desc_text = desc_match.group(1)
                    # Parse followers (e.g., "15.3K Followers" or "1,204 Followers")
                    f_match = re.search(r'([0-9.,kKmM]+)\s*Followers', desc_text, re.IGNORECASE)
                    if f_match:
                        f_str = f_match.group(1).lower().replace(',', '')
                        if 'k' in f_str:
                            try: followers = int(float(f_str.replace('k', '')) * 1000)
                            except: pass
                        elif 'm' in f_str:
                            try: followers = int(float(f_str.replace('m', '')) * 1000000)
                            except: pass
                        else:
                            try: followers = int(float(f_str))
                            except: pass
                    
                    # Parse following
                    fol_match = re.search(r'([0-9.,kKmM]+)\s*Following', desc_text, re.IGNORECASE)
                    if fol_match:
                        fol_str = fol_match.group(1).lower().replace(',', '')
                        if 'k' in fol_str:
                            try: following = int(float(fol_str.replace('k', '')) * 1000)
                            except: pass
                        elif 'm' in fol_str:
                            try: following = int(float(fol_str.replace('m', '')) * 1000000)
                            except: pass
                        else:
                            try: following = int(float(fol_str))
                            except: pass
            
            # Check Privacy
            if '"is_private":true' in content.lower() or "this account is private" in content.lower():
                is_private = True
            
            # Extract Full Name and Bio from Meta tags
            full_name = username
            bio = ""
            
            name_match = re.search(r'<meta property="og:title" content="([^"]+)"', content)
            if name_match:
                title = name_match.group(1)
                if '(@' in title: full_name = title.split('(@')[0].strip()
            
            bio_match = re.search(r'<meta property="og:description" content="([^"]+)"', content)
            if bio_match: bio = bio_match.group(1)
            
            # 4. Scrape Posts (Grid check) + capture screenshots for AI vision
            recent_posts = []
            post_links = await page.query_selector_all('a[href*="/p/"]')
            logger.info(f"📸 Found {len(post_links)} post links. Capturing thumbnails...")
            
            # Wait for grid images to load (Instagram lazy-loads them)
            try:
                await page.wait_for_load_state('networkidle', timeout=8000)
            except:
                pass  # Continue even if networkidle times out
            
            for link in post_links[:6]:  # Last 6 posts
                try:
                    href = await link.get_attribute('href')
                    if not href:
                        continue
                    
                    post_url = f"https://www.instagram.com{href}"
                    post_entry = {"url": post_url}
                    
                    # Try to get the image element inside this link and screenshot it
                    try:
                        img_el = await link.query_selector('img')
                        if img_el:
                            # Get the src URL as display_url
                            src = await img_el.get_attribute('src')
                            if src:
                                post_entry['display_url'] = src
                            
                            # ✅ CHECK: Only screenshot if the image is actually loaded (naturalWidth > 50px)
                            natural_width = await img_el.evaluate('el => el.naturalWidth')
                            if not natural_width or natural_width < 50:
                                # Image not loaded yet — wait a moment and re-check
                                logger.info(f"  ⏳ Image not loaded yet (naturalWidth={natural_width}), waiting...")
                                await asyncio.sleep(2)
                                natural_width = await img_el.evaluate('el => el.naturalWidth')
                            
                            if natural_width and natural_width >= 50:
                                # Take a screenshot of this specific image element
                                img_bytes = await img_el.screenshot(type='jpeg', quality=75)
                                # 5000 bytes minimum — anything smaller is a blurred placeholder
                                if img_bytes and len(img_bytes) > 5000:
                                    import base64
                                    post_entry['b64_data'] = base64.b64encode(img_bytes).decode('utf-8')
                                    logger.info(f"  ✅ Post screenshot captured ({len(img_bytes)} bytes, {natural_width}px wide)")
                                else:
                                    logger.warning(f"  ⚠️ Screenshot too small ({len(img_bytes) if img_bytes else 0} bytes) — skipped (likely placeholder)")
                            else:
                                logger.warning(f"  ⚠️ Image did not load (naturalWidth={natural_width}) — skipped")
                    except Exception as img_err:
                        logger.warning(f"  ⚠️ Failed to screenshot post img: {img_err}")
                    
                    recent_posts.append(post_entry)
                except Exception as link_err:
                    logger.warning(f"  ⚠️ Failed to process post link: {link_err}")
            
            logger.info(f"✅ Scraped: @{username} | {followers} Followers | {len(recent_posts)} Posts (with {sum(1 for p in recent_posts if p.get('b64_data'))} screenshots)")

            
            return {
                "success": True,
                "full_name": full_name,
                "bio": bio,
                "followers": followers,
                "following": following,
                "posts": recent_posts,
                "is_private": is_private
            }
            
        except Exception as e:
            logger.error(f"❌ Analysis error: {e}")
            return {"success": False, "error": str(e)}

    # --- Data Utils ---

    async def get_leads(self, user_id: int, status: str = None, keyword: str = None, limit: int = 5000, offset: int = 0):
        """Retrieve Instagram leads with filtering and VIP sorting."""
        try:
            await db.execute("DELETE FROM instagram_leads WHERE status = 'failed'")
        except Exception as cleanup_err:
            logger.warning(f"Dynamic failed leads cleanup failed: {cleanup_err}")

        where_clause = " WHERE user_id = $1"
        params = [user_id]
        if status:
            if status == 'qualified':
                where_clause += " AND status IN ('qualified', 'analyzed', 'vetted', 'harvested')"
            elif status == 'rejected':
                where_clause += " AND status IN ('rejected', 'discarded')"
            elif status == 'discovered':
                where_clause += " AND status IN ('discovered', 'queued')"
            elif status == 'google_rejected':
                where_clause += " AND status IN ('google_rejected', 'failed')"
            else:
                params.append(status)
                where_clause += f" AND status = ${len(params)}"
        else:
            # Exclude discarded, google_rejected (trash), and failed from 'all' view to keep it clean
            where_clause += " AND status NOT IN ('discarded', 'google_rejected', 'failed')"
            
        if keyword:
            clean_kw = keyword.lstrip('@')
            params.append(f"{clean_kw}%")
            where_clause += f" AND instagram_username ILIKE ${len(params)}"

        # 🧮 Count total matching records before applying LIMIT/OFFSET
        count_query = f"SELECT COUNT(*) FROM instagram_leads{where_clause}"
        total_count = await db.fetchval(count_query, *params)
        
        # 🏆 ACTION-FIRST INDUSTRIAL SEQUENCE:
        # 0. Waiting Approval (Approve & Scrape) -> ABSOLUTE TOP (0)
        # 1. Scrape Complete (Mission Finish)    -> SECOND (1)
        # 2. Main Search Leads (Discovery Core)  -> THIRD (2)
        # 3. Follower Wave (Network Expansion)   -> BOTTOM (3)
        query = f"SELECT * FROM instagram_leads{where_clause}"
        query += f""" ORDER BY (
            CASE 
                WHEN status IN ('qualified', 'analyzed', 'vetted', 'harvested') THEN 0
                WHEN status IN ('rejected', 'discarded') THEN 1
                WHEN status = 'private' THEN 2
                WHEN status = 'failed' THEN 3
                WHEN status = 'pending_ai' THEN 4
                WHEN status = 'discovered' THEN 5
                ELSE 6
            END) ASC, updated_at DESC, created_at DESC LIMIT {limit} OFFSET {offset}"""
        rows = await db.fetch(query, *params)
        leads = []
        for row in rows:
            d = dict(row)
            # Parse JSON fields for frontend consumption
            try:
                d['recent_posts'] = json.loads(d.get('recent_posts') or '[]')
            except:
                d['recent_posts'] = []
                
            try:
                audit = json.loads(d.get('data_audit_json') or '{}') if isinstance(d.get('data_audit_json'), str) else (d.get('data_audit_json') or {})
                d['data_audit_json'] = audit
                # 🏎️ UI Sync: Map the dynamic rejection reason or fallback to vision_reason
                d['rejection_reason'] = audit.get('rejection_reason', audit.get('vision_reason', ''))
            except:
                d['data_audit_json'] = {}
                d['rejection_reason'] = ''
                
            leads.append(d)
        return {
            "leads": leads,
            "total": total_count
        }

    async def harvest_lead_network(self, user_id: int, lead_id: int, force_priority: bool = False):
        """🚀 PHASE 2: Deep Scrape - Get 150 Followers for viral growth!"""
        # 🔒 UNIFIED SEQUENTIAL LOCK: Queue if ANY mission is active (Harvest or Auto-Pilot)
        is_auto_pilot_busy = self.workers.get(user_id, False)
        # If force_priority is True, we bypass the auto-pilot busy check (used by auto-pilot himself!)
        if user_id in self._harvest_tasks or (is_auto_pilot_busy and not force_priority):
            logger.info(f"⏳ QUEUEING: User {user_id} busy. Lead {lead_id} entering mission queue.")
            try:
                await db.execute("UPDATE instagram_leads SET status = 'queued', updated_at = NOW() WHERE id = $1 AND user_id = $2", lead_id, user_id)
                await manager.send_personal_message({
                    "type": "instagram_lead_updated",
                    "lead_id": lead_id,
                    "status": "queued",
                    "message": "⏰ Queue Active: Your surge is scheduled and will start automatically! 🏎️💨"
                }, user_id)
            except: pass
            return

        lead = await db.fetchrow("SELECT instagram_username, status as original_status FROM instagram_leads WHERE id = $1 AND user_id = $2", lead_id, user_id)
        if not lead: return
        username = lead['instagram_username']
        original_status = lead['original_status']  # Remember original status to restore if rejected
        
        # 🏗️ REGISTER TASK LOCK
        self._harvest_tasks[user_id] = lead_id
        
        # 🔒 ASSIGNMENT CHECK: Use the same account that analyzed this lead (Human Consistency)
        account = None
        assigned = await db.fetchrow("SELECT assigned_account_id FROM instagram_leads WHERE id = $1", lead_id)
        if assigned and assigned['assigned_account_id']:
            account = await db.fetchrow(f"""
                SELECT a.*, p.host, p.port, p.username as p_user, p.password as p_pass, p.proxy_type 
                FROM instagram_accounts a LEFT JOIN instagram_proxies p ON a.proxy_id = p.id
                WHERE a.id = $1 AND a.status = 'active' LIMIT 1
            """, assigned['assigned_account_id'])

        # 🚀 DIRECT ANONYMOUS SURGE: No Ghost Account required for InstaCognito!
        logger.info(f"🛰️ Launching Direct Anonymous Surge for @{username} via InstaCognito...")
        
        harvest_success = False
        count = 0
        
        try:
            # 🚀 DIRECT CONNECTION: No Proxy, using local IP for maximum stability
            proxy_data = None 

            # 🚀 DEPLOY ANONYMOUS BROWSER
            result = await browser_engine.run_anonymous_session(
                username,
                self._perform_easycomment_harvest,
                is_desktop=False,
                proxy=proxy_data
            )

            if result and result.get('success'):
                # Save results
                for f_user in result.get('usernames', []):
                    try:
                        await db.execute("""
                            INSERT INTO instagram_leads (user_id, instagram_username, discovery_keyword, source, status) 
                            VALUES ($1, $2, $3, 'network_expansion', 'discovered') 
                            ON CONFLICT (user_id, instagram_username) DO UPDATE SET
                                status = 'discovered', updated_at = NOW()
                        """, user_id, f_user, f"follower_of_{username}")
                        count += 1
                    except: continue
                
                if count > 0:
                    harvest_success = True
                    logger.info(f"✅ InstaCognito Surge Complete for @{username}! {count} leads added.")
                else:
                    logger.warning(f"⚠️ InstaCognito returned no usernames for @{username}.")
            else:
                logger.error(f"❌ InstaCognito session failed for @{username}")

        except Exception as e:
            logger.error(f"❌ Harvest Surge failed: {e}")

        # 🕵️ If ALL ghost accounts failed, try Ghost-less fallback
        if not harvest_success:
            logger.info(f"--- 🛰️ RESILIENT FALLBACK: All ghosts failed for @{username}. Attempting Ghost-less Search Surge... ---")
            fallback_query = f'site:instagram.com "follower of {username}"'
            fallback_mirrors = [
                f"https://www.picuki.com/profile/{username}",
                f"https://html.duckduckgo.com/html/?q={quote(fallback_query)}"
            ]
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"}) as client:
                for url in fallback_mirrors:
                    try:
                        res = await client.get(url)
                        if res.status_code == 200:
                            m_matches = re.findall(r'instagram\.com/([a-zA-Z0-9._]{3,30})', res.text)
                            for m_user in set(m_matches):
                                if m_user.lower() not in {username.lower(), 'reels', 'about', 'legal', 'terms', 'privacy'} and self._is_valid_username(m_user):
                                    try:
                                        await db.execute("""
                                            INSERT INTO instagram_leads (user_id, instagram_username, discovery_keyword, source, status) 
                                            VALUES ($1, $2, $3, 'network_expansion', 'discovered') ON CONFLICT DO NOTHING
                                        """, user_id, m_user, f"search_surge_{username}")
                                        count += 1
                                    except: pass
                                    if count >= 30: break
                            if count > 0:
                                logger.info(f"✨ Resilient Fallback found {count} leads!")
                                break
                    except: continue

        # 🔓 RELEASE LOCK + FINAL UI SYNC
        self._harvest_tasks.pop(user_id, None)
        try:
            # 🛡️ INTEGRITY CHECK: Only mark as 'harvested' if we actually found something
            final_status = original_status if original_status == 'rejected' else 'harvested'
            
            if harvest_success and count > 0:
                await db.execute("UPDATE instagram_leads SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3", final_status, lead_id, user_id)
                logger.info(f"🛰️ Mission Successful: Lead {lead_id} marked as '{final_status}'")
            else:
                final_status = original_status # Revert to original
                logger.warning(f"⚠️ Mission Incomplete: Lead {lead_id} remains as '{original_status}' (No data found).")
                # Clear the processing/queued status so it can be retried
                await db.execute("UPDATE instagram_leads SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3", original_status, lead_id, user_id)
            
            await manager.send_personal_message({"type": "instagram_lead_updated", "lead_id": lead_id, "status": final_status}, user_id)
            logger.info(f"🛰️ Signal Sent: Lead {lead_id} marked as '{final_status}' for user {user_id}")
            
            # 🏎️ NEXT IN LINE: Auto-trigger next queued lead
            next_in_queue = await db.fetchrow("""
                SELECT id FROM instagram_leads 
                WHERE user_id = $1 AND status = 'queued' 
                ORDER BY updated_at ASC LIMIT 1
            """, user_id)
            if next_in_queue:
                logger.info(f"🚀 SUCCESSION: Triggering next queued lead: {next_in_queue['id']}")
                asyncio.create_task(self.harvest_lead_network(user_id, next_in_queue['id']))
        except Exception as se:
            logger.warning(f"⚠️ Status/Queue sync failed: {se}")

    async def get_lead_network(self, user_id: int, lead_id: int, direction: str = None):
        """Returns the scraped followers/following usernames for a specific lead."""
        # Security check: Verify this lead belongs to the requesting user
        lead = await db.fetchrow("SELECT id FROM instagram_leads WHERE id = $1 AND user_id = $2", lead_id, user_id)
        if not lead:
            return {"error": "Lead not found"}
        
        query = "SELECT direction, network_username, discovered_at FROM instagram_lead_network WHERE lead_id = $1"
        params = [lead_id]
        if direction in ('follower', 'following'):
            params.append(direction)
            query += f" AND direction = ${len(params)}"
        query += " ORDER BY discovered_at DESC LIMIT 500"
        rows = await db.fetch(query, *params)
        return [dict(row) for row in rows]

    async def get_stats(self, user_id: int):
        stats = await db.fetchrow("""
            SELECT 
                COUNT(*) FILTER (WHERE status NOT IN ('discarded', 'google_rejected', 'failed')) as total, 
                COUNT(*) FILTER (WHERE status IN ('discovered', 'queued')) as discovered, 
                COUNT(*) FILTER (WHERE status IN ('qualified', 'analyzed', 'vetted', 'harvested')) as analyzed,
                COUNT(*) FILTER (WHERE status IN ('rejected', 'discarded')) as rejected,
                COUNT(*) FILTER (WHERE status = 'contacted') as contacted,
                COUNT(*) FILTER (WHERE status = 'converted') as converted
            FROM instagram_leads WHERE user_id = $1
        """, user_id)
        return dict(stats) if stats else {"total": 0, "discovered": 0, "analyzed": 0, "rejected": 0, "contacted": 0, "converted": 0}

    async def get_proxies(self, user_id: int):
        rows = await db.fetch("SELECT * FROM instagram_proxies WHERE user_id = $1", user_id)
        return [dict(row) for row in rows]

    async def add_proxy(self, user_id: int, proxy):
        # Support bundle string in 'host' field
        is_bundle = isinstance(proxy.host, str) and (':' in proxy.host or '|' in proxy.host)
        
        if is_bundle:
            p_data = self._parse_proxy_str(proxy.host)
            if p_data:
                await db.execute("""
                    INSERT INTO instagram_proxies (user_id, host, port, username, password, proxy_type) 
                    VALUES ($1, $2, $3, $4, $5, $6)
                """, user_id, p_data['host'], p_data['port'], p_data['user'], p_data['pass'], proxy.proxy_type or 'http')
                return {"status": "success"}
        
        # Standard Insert
        await db.execute("INSERT INTO instagram_proxies (user_id, host, port, username, password, proxy_type) VALUES ($1, $2, $3, $4, $5, $6)", user_id, proxy.host, proxy.port, proxy.username, proxy.password, proxy.proxy_type)
        return {"status": "success"}

    async def delete_proxy(self, user_id: int, proxy_id: int):
        await db.execute("UPDATE instagram_accounts SET proxy_id = NULL WHERE proxy_id = $1", proxy_id)
        await db.execute("DELETE FROM instagram_proxies WHERE id = $1", proxy_id)
        return {"status": "success"}

    async def bulk_add_proxies(self, user_id: int, proxy_input: Union[str, List[str]]):
        """
        Parses multi-line proxy input and adds them to the shield pool.
        """
        if isinstance(proxy_input, str):
            lines = proxy_input.strip().split('\n')
        else:
            lines = proxy_input
            
        results = {"success": 0, "failed": 0}

        for line in lines:
            if not line.strip(): continue
            try:
                p_data = self._parse_proxy_str(line)
                if not p_data:
                    results["failed"] += 1
                    continue
                
                await db.execute("""
                    INSERT INTO instagram_proxies (user_id, host, port, username, password, proxy_type) 
                    VALUES ($1, $2, $3, $4, $5, 'http')
                """, user_id, p_data['host'], p_data['port'], p_data['user'], p_data['pass'])
                results["success"] += 1
            except Exception as e:
                logger.error(f"Bulk proxy error: {e}")
                results["failed"] += 1
        
        # --- 🚀 AUTO-RESCUE: Assign to accounts with NO proxy ---
        if results["success"] > 0:
            await self.auto_rescue_user_accounts(user_id)

        return results

    async def auto_rescue_user_accounts(self, user_id: int):
        """Helper to assign proxies to any accounts that are missing one."""
        accounts_without_proxy = await db.fetch("SELECT id FROM instagram_accounts WHERE user_id = $1 AND proxy_id IS NULL", user_id)
        if accounts_without_proxy:
            logger.info(f"🆘 Found {len(accounts_without_proxy)} accounts without proxy for user {user_id}. Rescuing...")
            # Fetch all available proxies (admin and private)
            proxy_rows = await db.fetch("SELECT * FROM instagram_proxies WHERE user_id = $1 ORDER BY id ASC", user_id)
            if proxy_rows:
                proxies = [dict(p) for p in proxy_rows]
                for i, acc in enumerate(accounts_without_proxy):
                    p = proxies[i % len(proxies)]
                    p_str = f"{p['host']}:{p['port']}"
                    if p['username']: p_str += f":{p['username']}:{p['password']}"
                    
                    await db.execute(
                        "UPDATE instagram_accounts SET proxy_id = $1, proxy = $2 WHERE id = $3",
                        p['id'], p_str, acc['id']
                    )
            logger.info(f"✅ Auto-Rescue complete for user {user_id}!")

    async def bulk_add_global_proxies(self, proxy_input: str):
        """
        Admin-only: Adds proxies to the global pool and redistributes them across ALL users.
        """
        lines = proxy_input.strip().split('\n')
        results = {"success": 0, "failed": 0}
        
        # 1. Clear old global pool (or we could append, but full refresh is cleaner for rebalancing)
        await db.execute("DELETE FROM instagram_global_proxies")

        for line in lines:
            if not line.strip(): continue
            try:
                p_data = self._parse_proxy_str(line)
                if not p_data:
                    results["failed"] += 1
                    continue
                
                await db.execute("""
                    INSERT INTO instagram_global_proxies (host, port, username, password, proxy_type) 
                    VALUES ($1, $2, $3, $4, 'http')
                """, p_data['host'], p_data['port'], p_data['user'], p_data['pass'])
                results["success"] += 1
            except Exception as e:
                logger.error(f"Global proxy error: {e}")
                results["failed"] += 1
        
        # 2. Trigger global rebalance
        if results["success"] > 0:
            await self.rebalance_global_proxies()
            
        return results

    async def rebalance_global_proxies(self):
        """
        🚀 THE BALANCING ENGINE: Redistributes global proxies across all users.
        """
        logger.info("⚖️ Starting Global Proxy Rebalance...")
        
        # 1. Get all active users and all global proxies
        users = await db.fetch("SELECT id FROM users WHERE is_active = TRUE")
        global_proxies = await db.fetch("SELECT * FROM instagram_global_proxies ORDER BY id ASC")
        
        if not users or not global_proxies:
            logger.warning("⚖️ Rebalance skipped: No users or no global proxies found.")
            return

        # 2. Clear ONLY admin-assigned proxies for all users
        # This keeps user-private proxies safe!
        await db.execute("DELETE FROM instagram_proxies WHERE is_admin_assigned = TRUE")

        # 3. Perform Round-Robin Distribution
        # We handle two cases to ensure maximum coverage:
        # Case A: More proxies than users (Distribute all proxies so users get multiple)
        # Case B: More users than proxies (Share proxies so every user has at least one)
        
        if len(global_proxies) >= len(users):
            # Every global proxy gets assigned to a user in a rotating cycle.
            for i, gp in enumerate(global_proxies):
                assigned_user = users[i % len(users)]
                user_id = assigned_user['id']
                
                await db.execute("""
                    INSERT INTO instagram_proxies (user_id, host, port, username, password, proxy_type, global_proxy_id, is_admin_assigned)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
                """, user_id, gp['host'], gp['port'], gp['username'], gp['password'], gp['proxy_type'], gp['id'])
        else:
            # Every user gets assigned a global proxy in a rotating cycle.
            for j, user in enumerate(users):
                gp = global_proxies[j % len(global_proxies)]
                user_id = user['id']
                
                await db.execute("""
                    INSERT INTO instagram_proxies (user_id, host, port, username, password, proxy_type, global_proxy_id, is_admin_assigned)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
                """, user_id, gp['host'], gp['port'], gp['username'], gp['password'], gp['proxy_type'], gp['id'])

        # 4. Final Safety: Trigger auto-rescue for ALL users
        # This ensures all accounts pick up their newly assigned proxies
        for user in users:
            await self.auto_rescue_user_accounts(user['id'])
            
        logger.info(f"✅ Rebalanced {len(global_proxies)} proxies across {len(users)} users.")

    async def assign_global_proxies_to_user(self, user_id: int):
        """
        Assigns a fair share of global proxies to a specific NEW user.
        """
        global_proxies = await db.fetch("SELECT * FROM instagram_global_proxies ORDER BY id ASC")
        if not global_proxies: return
        
        # For a new user, we could just rebalance everything, 
        # but to be efficient, we can just give them a "share" or rebalance.
        # Rebalancing is safer to maintain the exact ratios requested.
        await self.rebalance_global_proxies()

    async def get_accounts(self, user_id: int):
        rows = await db.fetch("SELECT i.*, p.host as proxy_host FROM instagram_accounts i LEFT JOIN instagram_proxies p ON i.proxy_id = p.id WHERE i.user_id = $1", user_id)
        return [dict(row) for row in rows]

    async def update_account_settings(self, user_id: int, account_id: int, target_language: str, source_language: str, is_translation_enabled: bool, proxy: Optional[str] = None):
        row = await db.fetchrow("SELECT * FROM instagram_accounts WHERE id = $1 AND user_id = $2", account_id, user_id)
        if not row:
            raise HTTPException(status_code=404, detail="Account not found")

        await db.execute(
            """
            UPDATE instagram_accounts 
            SET target_language = $1, source_language = $2, is_translation_enabled = $3, proxy = $4, updated_at = NOW()
            WHERE id = $5
            """,
            target_language, source_language, is_translation_enabled, proxy, account_id
        )
        return await db.fetchrow("SELECT * FROM instagram_accounts WHERE id = $1", account_id)

    def _parse_proxy_str(self, p_str: str):
        """🚀 INDUSTRIAL PARSER: Supports host:port:user:pass, user:pass@host:port, etc."""
        if not p_str: return None
        
        # 1. Clean string (remove tabs, spaces, protocols)
        p_str = str(p_str).replace('\t', ' ').strip()
        p_str = re.sub(r'^https?://', '', p_str.split(' ')[0])
        
        # 2. Handle user:pass@host:port format
        if '@' in p_str:
            try:
                auth, server = p_str.split('@', 1)
                user, pw = auth.split(':', 1)
                host, port = server.split(':', 1)
                return {"host": host, "port": int(port), "user": user, "pass": pw}
            except: pass

        # 3. Handle colon-separated formats
        parts = [p.strip() for p in p_str.split(':')]
        
        # Case: host:port:user:pass
        if len(parts) == 4:
            try:
                # If first part is host-like
                if '.' in parts[0] or parts[0].isdigit():
                    return {"host": parts[0], "port": int(parts[1]), "user": parts[2], "pass": parts[3]}
                # Otherwise assume user:pass:host:port
                return {"host": parts[2], "port": int(parts[3]), "user": parts[0], "pass": parts[1]}
            except: pass
            
        # Case: host:port
        elif len(parts) == 2:
            try:
                return {"host": parts[0], "port": int(parts[1]), "user": "", "pass": ""}
            except: pass
            
        return None

    async def add_account(self, user_id: int, account_data):
        username = account_data.username
        password = account_data.password
        proxy_id = account_data.proxy_id
        v_code = account_data.verification_code
        manual_session = getattr(account_data, 'session_id', None)

        # 1. Resolve Proxy Details
        proxy_row = None
        if proxy_id:
            try:
                p_id = int(str(proxy_id))
                proxy_row = await db.fetchrow("SELECT * FROM instagram_proxies WHERE id = $1 AND user_id = $2", p_id, user_id)
            except: pass

        # 2. PERFORM LIVE LOGIN TEST (The "Human Handshake")
        from instagrapi import Client
        from instagrapi.exceptions import TwoFactorRequired, ChallengeRequired, LoginRequired
        cl = Client()
        
        if proxy_row:
            p_auth = f"{proxy_row['username']}:{proxy_row['password']}@" if proxy_row['username'] else ""
            p_url = f"{proxy_row['proxy_type']}://{p_auth}{proxy_row['host']}:{proxy_row['port']}"
            cl.set_proxy(p_url)

        try:
            # OPTION A: MANUAL SESSION BYPASS (Tunnel Mode)
            if manual_session and len(manual_session) > 5:
                clean_session_str = unquote(manual_session)
                logger.info(f"🛰️ Attempting Absolute-Bypass for @{username}...")
                
                # 🎭 BROWSER IDENTITY LOCK
                cl.set_device({
                    "app_version": "385.0.0.47.74",
                    "manufacturer": "Instagram",
                    "model": "Web",
                    "device": "Web",
                })
                cl.user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                
                # 🍱 ROBUST COOKIE ADOPTION
                cookies = {}
                for item in clean_session_str.split(';'):
                    if '=' in item:
                        k, v = item.strip().split('=', 1)
                        cookies[k] = v
                    elif len(item.strip()) > 30: 
                        cookies['sessionid'] = item.strip()
                
                # Forced Injection
                sid = cookies.get('sessionid', clean_session_str)
                cl.login_by_sessionid(sid)
                
                # 🔐 APP-ID LOCK (The Mission Critical Key)
                cl.public_api_key = "936619743392459" 
                
                try:
                    logger.info("🧪 Finalizing Absolute Identity Fusion...")
                    # 🔐 CSRF Handshake: Load the base page to fetch CSRF keys
                    cl.user_id_from_username(username)
                    session_id = sid
                        
                    logger.info(f"✅ Absolute Fusion Successful for @{username}")
                except Exception as ve:
                    logger.error(f"❌ Absolute Fusion Failed: {ve}")
                    return {"status": "error", "message": "Identity Fusion Failed. Please use a fresh session from a Chrome browser on the SAME IP."}
            
            # OPTION B: STANDARD LOGIN HANDSHAKE
            else:
                logger.info(f"✨ Performing Live Handshake for @{username}...")
                if v_code:
                    cl.login(username, password, verification_code=v_code)
                else:
                    cl.login(username, password)
                session_id = cl.get_settings()['cookie_dict'].get('sessionid')
            
            # SUCCESS: Save the Authorized identity
            db_proxy_id = int(proxy_id) if proxy_id and str(proxy_id).isdigit() else None
            manual_proxy = getattr(account_data, 'proxy', None)
            
            await db.execute("""
                INSERT INTO instagram_accounts (user_id, username, password, proxy_id, proxy, status, session_id, verification_code, last_used_at)
                VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, NOW())
                ON CONFLICT (username) DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    password = EXCLUDED.password,
                    proxy_id = EXCLUDED.proxy_id,
                    proxy = EXCLUDED.proxy,
                    status = 'active',
                    session_id = EXCLUDED.session_id,
                    verification_code = EXCLUDED.verification_code,
                    last_used_at = NOW()
            """, user_id, username, password, db_proxy_id, manual_proxy, session_id, v_code)
            
            logger.info(f"✅ Ghost @{username} AUTHORIZED via Tunnel.")
            return {"status": "success", "message": "Account Authorized! ✨"}

        except TwoFactorRequired as e:
            logger.warning(f"🔐 2FA REQUIRED for @{username}. Awaiting User Input...")
            return {
                "status": "2fa_required", 
                "message": "Enter the 6-digit code from your Authentication App.", 
                "two_factor_identifier": getattr(e, 'two_factor_identifier', None)
            }
        except Exception as e:
            logger.error(f"❌ Handshake Failed for @{username}: {e}")
            return {"status": "error", "message": str(e)}

    async def delete_account(self, user_id: int, account_id: int):
        await db.execute("DELETE FROM instagram_accounts WHERE id = $1 AND user_id = $2", account_id, user_id)
        return {"status": "success"}

    async def bulk_add_accounts(self, user_id: int, account_input: Union[str, List[str]], proxy_id: Optional[int] = None):
        """
        Processes a multi-line input of account identities using the 'Warmer Replica' method.
        Supports: @username|password|2fa_seed|cookie_data
        """
        if isinstance(account_input, str):
            lines = account_input.strip().split('\n')
        else:
            lines = account_input

        results = {"success": 0, "failed": 0, "errors": []}
        
        # --- 🛡️ PROXY ROTATION LOGIC ---
        available_proxies = []
        if not proxy_id:
            # Fetch all proxies owned by this user
            proxy_rows = await db.fetch("SELECT id FROM instagram_proxies WHERE user_id = $1 ORDER BY id ASC", user_id)
            available_proxies = [r['id'] for r in proxy_rows]
            logger.info(f"🔄 Proxy Rotation: Found {len(available_proxies)} proxies for Round-Robin assignment.")

        proxy_index = 0
        
        for line in lines:
            line = line.strip()
            if not line: continue
            
            try:
                # --- 🚀 UNIVERSAL PARSER: Smart Detection of Labeled Text & JSON Cookies ---
                username = ""
                password = ""
                fa_secret = None
                session_id = None
                ds_user_id = None
                full_cookies_json = None
                
                # 1. Detect Labeled Formats (e.g., 账号:user | 密码:pass | Cookies:[...])
                if "账号:" in line or "账号：" in line or "Username:" in line:
                    username_match = re.search(r'(?:账号|Username)[:：]\s*([a-zA-Z0-9._]+)', line)
                    password_match = re.search(r'(?:密码|Password)[:：]\s*([^| \t\n]+)', line)
                    fa_match = re.search(r'(?:2FA|Secret|SecretKey)[:：]\s*([A-Z2-7]{16,})', line, re.I)
                    
                    if username_match: username = username_match.group(1)
                    if password_match: password = password_match.group(1)
                    if fa_match: fa_secret = fa_match.group(1)
                    
                    # Detect JSON Cookie Array
                    cookie_json_match = re.search(r'Cookies?:\s*(\[.*?\])', line, re.I | re.S)
                    if cookie_json_match:
                        full_cookies_json = cookie_json_match.group(1)
                        try:
                            cookies_list = json.loads(full_cookies_json)
                            for c in cookies_list:
                                if c.get('name') == 'sessionid': session_id = c.get('value')
                                if c.get('name') == 'ds_user_id': ds_user_id = c.get('value')
                        except: pass
                    
                    # Fallback for standard cookie strings inside labeled format
                    if not session_id and 'sessionid=' in line:
                        match = re.search(r'sessionid=([^; |\s]+)', line)
                        if match: session_id = match.group(1)
                
                # 2. Fallback to Delimiter-based parsing (Original Logic)
                if not username or not password:
                    sep = '|' if '|' in line else ':'
                    parts = line.split(sep)
                    if len(parts) >= 2:
                        username = parts[0].strip().lstrip('@')
                        password = parts[1].strip()
                        
                        for p_idx, p in enumerate(parts[2:]):
                            p = p.strip()
                            if not p: continue
                            if 'sessionid=' in p:
                                match = re.search(r'sessionid=([^; ]+)', p)
                                if match: session_id = match.group(1)
                            elif p_idx == 0 and p.replace(" ", "").isalnum() and len(p.replace(" ", "")) >= 16:
                                fa_secret = p.replace(" ", "").upper()
                            elif 'x-mid=' in p or 'ig-u-rur=' in p:
                                match = re.search(r'sessionid=([^;|\s]+)', p)
                                if match: session_id = match.group(1)

                if not username or not password:
                    results["failed"] += 1
                    continue

                # --- 🎯 ASSIGN PROXY (Round-Robin) ---
                current_proxy_id = proxy_id
                current_proxy_str = None
                
                if not current_proxy_id and available_proxies:
                    current_proxy_id = available_proxies[proxy_index % len(available_proxies)]
                    proxy_index += 1
                
                if current_proxy_id:
                    # Fetch proxy details to sync the string field for the manual box
                    p = await db.fetchrow("SELECT * FROM instagram_proxies WHERE id = $1", current_proxy_id)
                    if p:
                        current_proxy_str = f"{p['host']}:{p['port']}"
                        if p['username']: current_proxy_str += f":{p['username']}:{p['password']}"

                await db.execute("""
                    INSERT INTO instagram_accounts (user_id, username, password, proxy_id, proxy, session_id, ds_user_id, full_cookies_json, verification_code, status) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
                    ON CONFLICT (username) DO UPDATE SET
                        password = EXCLUDED.password,
                        proxy_id = COALESCE(EXCLUDED.proxy_id, instagram_accounts.proxy_id),
                        proxy = COALESCE(EXCLUDED.proxy, instagram_accounts.proxy),
                        session_id = COALESCE(EXCLUDED.session_id, instagram_accounts.session_id),
                        ds_user_id = COALESCE(EXCLUDED.ds_user_id, instagram_accounts.ds_user_id),
                        full_cookies_json = COALESCE(EXCLUDED.full_cookies_json, instagram_accounts.full_cookies_json),
                        verification_code = COALESCE(EXCLUDED.verification_code, instagram_accounts.verification_code),
                        status = 'active',
                        updated_at = NOW()
                """, user_id, username, password, current_proxy_id, current_proxy_str, session_id, ds_user_id, full_cookies_json, fa_secret)
                results["success"] += 1
            except Exception as e:
                logger.error(f"Bulk add error on line '{line}': {e}")
                results["failed"] += 1
                results["errors"].append(str(e))
                
        return results

    async def delete_lead(self, user_id: int, lead_id: int):
        await db.execute("DELETE FROM instagram_leads WHERE id = $1 AND user_id = $2", lead_id, user_id)
        return {"status": "success"}

    async def update_lead_status(self, user_id: int, lead_id: int, status: str):
        """Explicitly update the status of a lead (Manual Vetting)."""
        await db.execute("UPDATE instagram_leads SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3", status, lead_id, user_id)
        
        # 🏎️💨 Instant UI Update: Tell the frontend about the verdict!
        try:
            await manager.send_personal_message({
                "type": "instagram_lead_updated",
                "lead_id": lead_id,
                "status": status
            }, user_id)
        except: pass
        
        return {"status": "success"}

    async def clear_all_leads(self, user_id: int):
        await db.execute("DELETE FROM instagram_leads WHERE user_id = $1", user_id)
        return {"status": "success"}

    def __init__(self):
        self.workers = {} # user_id: bool

    async def _ensure_settings_table(self):
        try:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS instagram_filter_settings (
                    user_id INTEGER PRIMARY KEY,
                    bio_keywords TEXT DEFAULT '',
                    min_followers INTEGER DEFAULT 0,
                    max_followers INTEGER DEFAULT 0,
                    sample_hashes TEXT DEFAULT '[]',
                    visual_niche TEXT DEFAULT '',
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """)
            # 🏎️ SELF-HEALING: Ensure columns exist if table was created in older version
            await db.execute("""
                ALTER TABLE instagram_filter_settings ADD COLUMN IF NOT EXISTS visual_niche TEXT DEFAULT '';
                ALTER TABLE instagram_filter_settings ADD COLUMN IF NOT EXISTS sample_hashes TEXT DEFAULT '[]';
                ALTER TABLE instagram_filter_settings ADD COLUMN IF NOT EXISTS minimax_api_key TEXT DEFAULT '';
                ALTER TABLE instagram_filter_settings ADD COLUMN IF NOT EXISTS enable_ai_filter BOOLEAN DEFAULT FALSE;
                ALTER TABLE instagram_filter_settings ADD COLUMN IF NOT EXISTS google_niche_filter TEXT DEFAULT '';
                ALTER TABLE instagram_filter_settings ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT 'minimax-text-01';
                ALTER TABLE instagram_filter_settings ADD COLUMN IF NOT EXISTS bio_exclude_keywords TEXT DEFAULT '';
                ALTER TABLE instagram_filter_settings ADD COLUMN IF NOT EXISTS bio_cities_whitelist TEXT DEFAULT '';
                ALTER TABLE instagram_filter_settings ADD COLUMN IF NOT EXISTS enable_ai_analysis BOOLEAN DEFAULT TRUE;
                ALTER TABLE instagram_filter_settings ADD COLUMN IF NOT EXISTS ai_intent_filter TEXT DEFAULT '';
            """)
            
            await db.execute("""
                ALTER TABLE instagram_accounts 
                  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP,
                  ADD COLUMN IF NOT EXISTS session_id TEXT,
                  ADD COLUMN IF NOT EXISTS verification_code TEXT,
                  ADD COLUMN IF NOT EXISTS settings_dump JSONB,
                  ADD COLUMN IF NOT EXISTS frozen_until TIMESTAMP,
                  ADD COLUMN IF NOT EXISTS daily_usage_count INTEGER DEFAULT 0,
                  ADD COLUMN IF NOT EXISTS last_usage_reset TIMESTAMP DEFAULT NOW(),
                  ADD COLUMN IF NOT EXISTS proxy TEXT,
                  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
            """)

            # Start global sequential AI loop if not already started
            if not hasattr(self, 'global_ai_task') or self.global_ai_task.done():
                self.global_ai_task = asyncio.create_task(self.global_ai_analysis_loop())
                logger.info("🚀 Global Sequential AI Task created.")
        except Exception as e:
            logger.warning(f"Settings table init: {e}")

    async def global_ai_analysis_loop(self):
        """🧠 GLOBAL AI ANALYSIS RUNNER: Automatically processes pending_ai leads for users who have enable_ai_analysis ON."""
        logger.info("🧠 Global Sequential AI Analysis Loop started...")
        while True:
            try:
                # Auto-disable AI analysis for users who have no pending AI leads
                users_to_disable = await db.fetch("""
                    SELECT user_id FROM instagram_filter_settings 
                    WHERE enable_ai_analysis = TRUE 
                      AND NOT EXISTS (
                          SELECT 1 FROM instagram_leads 
                          WHERE user_id = instagram_filter_settings.user_id AND status = 'pending_ai'
                      )
                """)
                for u_row in users_to_disable:
                    u_id = u_row["user_id"]
                    logger.info(f"🛑 [Global AI] No pending AI leads left for user {u_id}. Auto-disabling enable_ai_analysis.")
                    await db.execute("UPDATE instagram_filter_settings SET enable_ai_analysis = FALSE WHERE user_id = $1", u_id)
                    try:
                        await manager.send_personal_message({
                            "type": "filter_settings_updated",
                            "settings": {"enable_ai_analysis": False}
                        }, u_id)
                    except: pass

                # Fetch the oldest pending_ai lead for users who have enable_ai_analysis = TRUE
                pending_lead = await db.fetchrow("""
                    SELECT l.id, l.user_id 
                    FROM instagram_leads l
                    JOIN instagram_filter_settings s ON l.user_id = s.user_id
                    WHERE l.status = 'pending_ai' AND COALESCE(s.enable_ai_analysis, TRUE) = TRUE
                    ORDER BY l.updated_at ASC LIMIT 1
                """)
                if pending_lead:
                    lead_id = pending_lead["id"]
                    user_id = pending_lead["user_id"]
                    logger.info(f"🧠 [Global AI] Processing pending lead {lead_id} for user {user_id}...")
                    
                    try:
                        await manager.send_personal_message({
                            "type": "auto_analyze_started",
                            "lead_id": lead_id
                        }, user_id)
                    except: pass

                    try:
                        await self.run_sequential_ai_analysis(user_id, lead_id)
                    except Exception as e:
                        logger.error(f"Error in global AI analysis for lead {lead_id}: {e}")
                    finally:
                        try:
                            await manager.send_personal_message({
                                "type": "auto_analyze_finished",
                                "lead_id": lead_id
                            }, user_id)
                        except: pass
                else:
                    await asyncio.sleep(2)
            except Exception as e:
                logger.error(f"Error in global AI analysis loop: {e}")
                await asyncio.sleep(5)

    async def get_filter_settings(self, user_id: int):
        row = await db.fetchrow("SELECT * FROM instagram_filter_settings WHERE user_id = $1", user_id)
        if row:
            res = dict(row)
            res['sample_hashes'] = json.loads(res.get('sample_hashes') or '[]')
            # Handle default value if column is NULL in database
            if res.get('enable_ai_analysis') is None:
                res['enable_ai_analysis'] = True
            if res.get('ai_intent_filter') is None:
                res['ai_intent_filter'] = ""
            return res
        return {
            "user_id": user_id, 
            "bio_keywords": "", 
            "min_followers": 0, 
            "max_followers": 0, 
            "sample_hashes": [], 
            "visual_niche": "",
            "minimax_api_key": "",
            "enable_ai_filter": False,
            "google_niche_filter": "",
            "ai_model": "minimax-text-01",
            "bio_exclude_keywords": "",
            "bio_cities_whitelist": "",
            "enable_ai_analysis": True,
            "ai_intent_filter": ""
        }

    async def save_filter_settings(self, user_id: int, bio_keywords: str, min_followers: int, max_followers: int, sample_hashes: List[str] = None, visual_niche: str = "", minimax_api_key: str = "", enable_ai_filter: bool = False, google_niche_filter: str = "", ai_model: str = "minimax-text-01", bio_exclude_keywords: str = "", bio_cities_whitelist: str = "", enable_ai_analysis: bool = True, ai_intent_filter: str = ""):
        h_json = json.dumps(sample_hashes or [])
        await db.execute("""
            INSERT INTO instagram_filter_settings (user_id, bio_keywords, min_followers, max_followers, sample_hashes, visual_niche, minimax_api_key, enable_ai_filter, google_niche_filter, ai_model, bio_exclude_keywords, bio_cities_whitelist, enable_ai_analysis, ai_intent_filter, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
            ON CONFLICT (user_id) DO UPDATE
            SET bio_keywords = $2, min_followers = $3, max_followers = $4, sample_hashes = $5, visual_niche = $6, minimax_api_key = $7, enable_ai_filter = $8, google_niche_filter = $9, ai_model = $10, bio_exclude_keywords = $11, bio_cities_whitelist = $12, enable_ai_analysis = $13, ai_intent_filter = $14, updated_at = NOW()
        """, user_id, bio_keywords, min_followers, max_followers, h_json, visual_niche, minimax_api_key, enable_ai_filter, google_niche_filter, ai_model, bio_exclude_keywords, bio_cities_whitelist, enable_ai_analysis, ai_intent_filter)
        return {"status": "saved"}

    def _get_image_hash(self, img_content: bytes) -> str:
        """Generates a Visual Hash for a photo."""
        try:
            img = PIL.Image.open(io.BytesIO(img_content))
            import imagehash
            # 🧠 Upgraded: Generate both Perceptual and Gradient Hashes!
            p = str(imagehash.phash(img))
            d = str(imagehash.dhash(img))
            return f"{p}|{d}"
        except: return None

    async def generate_sample_hash(self, base64_img: str) -> str:
        """Utility for frontend to generate a hash from a file."""
        import base64
        if ',' in base64_img:
            base64_img = base64_img.split(',')[1]
        content = base64.b64decode(base64_img)
        return self._get_image_hash(content)

    def _generate_pre_filter_trace(self, settings: dict, bio: str, followers: int, full_name: str, username: str) -> list:
        """Generates a list of trace step dicts for all non-AI pre-filters, mirroring _check_non_ai_filters."""
        trace = []
        is_ok = True  # track cascading failures

        # 1. Follower Count Check
        min_f = settings.get('min_followers', 0)
        max_f = settings.get('max_followers', 0)
        if min_f > 0 or max_f > 0:
            detail = f"Found {followers:,} followers."
            passed = True
            if min_f > 0 and followers < min_f:
                passed = False
                detail += f" Below min limit of {min_f:,}."
            elif max_f > 0 and followers > max_f:
                passed = False
                detail += f" Above max limit of {max_f:,}."
            else:
                min_lbl = f"{min_f:,}" if min_f > 0 else "0"
                max_lbl = f"{max_f:,}" if max_f > 0 else "∞"
                detail += f" Within allowed range ({min_lbl} – {max_lbl})."
            if not passed:
                is_ok = False
            trace.append({"step": "Follower Count Check", "status": "passed" if passed else "failed", "details": detail})
        else:
            trace.append({"step": "Follower Count Check", "status": "skipped", "details": f"No follower range criteria set. Profile has {followers:,} followers."})

        # 2. Exclude Keyword Filter
        bio_exclude = settings.get('bio_exclude_keywords', '')
        if bio_exclude and bio_exclude.strip():
            if not is_ok:
                trace.append({"step": "Exclude Keyword Filter", "status": "skipped", "details": "Skipped because follower filter failed."})
            elif not bio:
                trace.append({"step": "Exclude Keyword Filter", "status": "passed", "details": "Profile bio is empty, so no exclude keywords matched."})
            else:
                exclude_kws = [k.strip().lower() for k in bio_exclude.split(',') if k.strip()]
                matched = [kw for kw in exclude_kws if kw in bio.lower()]
                if matched:
                    is_ok = False
                    trace.append({"step": "Exclude Keyword Filter", "status": "failed", "details": f"Bio contains blacklisted keyword(s): {', '.join(matched)}."})
                else:
                    trace.append({"step": "Exclude Keyword Filter", "status": "passed", "details": "Bio does not contain any blacklisted keywords."})
        else:
            trace.append({"step": "Exclude Keyword Filter", "status": "skipped", "details": "No exclude keywords list set."})

        # 3. Cities Whitelist Filter
        bio_cities = settings.get('bio_cities_whitelist', '')
        if bio_cities and bio_cities.strip():
            if not is_ok:
                trace.append({"step": "Cities Whitelist Filter", "status": "skipped", "details": "Skipped because previous step failed."})
            else:
                cities_list = [c.strip().lower() for c in bio_cities.split(',') if c.strip()]
                bio_lower = (bio or '').lower()
                full_name_lower = (full_name or '').lower()
                username_lower = (username or '').lower()
                matched_cities = [city for city in cities_list if city in bio_lower or city in full_name_lower or city in username_lower]
                if matched_cities:
                    trace.append({"step": "Cities Whitelist Filter", "status": "passed", "details": f"Matches whitelist city: '{matched_cities[0]}'."})
                else:
                    is_ok = False
                    trace.append({"step": "Cities Whitelist Filter", "status": "failed", "details": f"Profile details did not match any of: {', '.join(cities_list)}."})
        else:
            trace.append({"step": "Cities Whitelist Filter", "status": "skipped", "details": "No cities whitelist criteria set."})

        # 4. Bio Keyword Match
        bio_kws = settings.get('bio_keywords', '')
        if bio_kws and bio_kws.strip():
            if not is_ok:
                trace.append({"step": "Bio Keyword Match", "status": "skipped", "details": "Skipped because previous step failed."})
            else:
                passed = self._check_bio_keywords(bio, bio_kws)
                if not passed:
                    is_ok = False
                    trace.append({"step": "Bio Keyword Match", "status": "failed", "details": f"Bio does not match target keywords: {bio_kws}."})
                else:
                    trace.append({"step": "Bio Keyword Match", "status": "passed", "details": "Bio contains target search keyword(s)."})
        else:
            trace.append({"step": "Bio Keyword Match", "status": "skipped", "details": "No bio keyword criteria set."})

        return trace

    def _check_non_ai_filters(self, bio: str, followers: int, full_name: str, username: str, settings: dict) -> tuple[bool, str]:
        """
        Runs all non-AI filtering rules (Followers range, Exclude keywords, Whitelisted cities, Include keywords).
        Returns (is_qualified, rejection_reason).
        """
        # 1. Follower Count Match
        if settings.get('min_followers', 0) > 0 and followers < settings['min_followers']:
            return False, f"Follower check failed: {followers} followers is below the minimum requirement of {settings['min_followers']}."
        if settings.get('max_followers', 0) > 0 and followers > settings['max_followers']:
            return False, f"Follower check failed: {followers} followers is above the maximum limit of {settings['max_followers']}."

        # 2. Exclude Bio Keyword Filter (Block list)
        if bio:
            bio_exclude = settings.get('bio_exclude_keywords', '')
            if bio_exclude and bio_exclude.strip():
                exclude_kws = [k.strip().lower() for k in bio_exclude.split(',') if k.strip()]
                bio_lower = bio.lower()
                matched_kws = [kw for kw in exclude_kws if kw in bio_lower]
                if matched_kws:
                    return False, f"Bio contains a blacklisted keyword: '{matched_kws[0]}'."

        # 3. Cities Whitelist Filter (String check only, no AI)
        bio_cities = settings.get('bio_cities_whitelist', '')
        if bio_cities and bio_cities.strip():
            cities_list = [c.strip().lower() for c in bio_cities.split(',') if c.strip()]
            username_lower = (username or '').lower()
            full_name_lower = (full_name or '').lower()
            bio_lower_city = (bio or '').lower()

            city_found_fast = any(
                city in bio_lower_city or city in full_name_lower or city in username_lower
                for city in cities_list
            )
            if not city_found_fast:
                return False, "Location check failed: The profile does not match any city on your whitelist."

        # 4. Bio Keyword Match (Booster / Allow list)
        if not self._check_bio_keywords(bio, settings.get('bio_keywords', '')):
            return False, "Keyword check failed: Profile bio does not contain any of your target search keywords."

        return True, ""

    def _check_bio_keywords(self, bio: str, keywords_raw: str) -> bool:
        """Returns True if lead passes keyword filter (or no filter set)."""
        if not keywords_raw or not keywords_raw.strip():
            return True  # No filter set = everyone passes
        if not bio:
            return False  # Filter is set but lead has no bio = reject
        keywords = [k.strip().lower() for k in keywords_raw.split(',') if k.strip()]
        bio_lower = bio.lower()
        return any(kw in bio_lower for kw in keywords)

    async def _ai_city_check(self, username: str, full_name: str, bio: str, cities: list) -> tuple[bool, str]:
        """
        🧠 AI-powered city/region check using local Ollama (gemma4).
        Returns (is_match: bool, reason: str).
        Understands nicknames, abbreviations, landmarks (NYC, 305, South Beach, etc.)
        """
        import aiohttp, json

        cities_str = ', '.join(cities)
        prompt = (
            f"You are a location detection assistant.\n"
            f"Target cities/regions: {cities_str}\n\n"
            f"Instagram account info:\n"
            f"- Username: @{username}\n"
            f"- Full Name: {full_name or 'N/A'}\n"
            f"- Bio: {bio or 'N/A'}\n\n"
            f"Question: Is this Instagram account likely based in or serving any of the target cities/regions?\n"
            f"Consider: city abbreviations (NYC=New York, LA=Los Angeles), area codes (305=Miami), "
            f"neighborhoods, landmarks, slang terms, country/state names.\n\n"
            f"Respond ONLY with this JSON:\n"
            f'{{"match": true or false, "reason": "brief explanation"}}'
        )

        ollama_url = "http://localhost:11434"
        try:
            logger.info(f"🧠 [Gemma 4 City Check] @{username} via Ollama...")
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{ollama_url}/api/generate",
                    json={
                        "model": "gemma4",
                        "prompt": prompt,
                        "stream": False,
                        "options": {"temperature": 0.1}
                    },
                    timeout=120
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        raw = data.get("response", "{}")
                        # Extract JSON safely
                        match_json = re.search(r'\{.*\}', raw, re.DOTALL)
                        if match_json:
                            result = json.loads(match_json.group(0))
                        else:
                            result = json.loads(raw)
                        logger.info(f"🧠 [Gemma 4 City Check] @{username}: match={result.get('match')}, reason={result.get('reason')}")
                        return result.get("match", False), result.get("reason", "")
        except Exception as e:
            logger.warning(f"⚠️ Gemma 4 City Check failed: {e}")

        return False, "Gemma 4 city check failed or was unreachable"

    def _check_follower_range(self, followers: int, min_f: int, max_f: int) -> bool:
        """Returns True if follower count is within range (0 = no limit)."""
        if min_f > 0 and followers < min_f:
            return False
        if max_f > 0 and followers > max_f:
            return False
        return True

    async def _analysis_worker(self, user_id: int):
        """🚀 THE AUTO-PILOT WORKER: Scans leads in parallel and applies AI filters sequentially."""
        logger.info(f"Auto-Pilot Analysis Worker started for User {user_id}")
        self.workers[user_id] = True
        
        # 0. Clean up any stuck 'analyzing' leads from previous run
        try:
            await db.execute("UPDATE instagram_leads SET status = 'discovered', updated_at = NOW() WHERE user_id = $1 AND status = 'analyzing'", user_id)
        except Exception as reset_err:
            logger.error(f"Failed to reset analyzing status on startup: {reset_err}")

        # 1. Fetch user proxies to configure concurrency
        proxy_rows = await db.fetch("SELECT host, port, username, password FROM instagram_proxies WHERE user_id = $1 AND is_working = TRUE", user_id)
        proxies = [dict(r) for r in proxy_rows]

        # 20 max parallel windows, or proxy pool size. Default to 1 if no proxies to prevent local IP ban.
        concurrency = max(1, min(20, len(proxies))) if proxies else 1
        logger.info(f"Setting parallel scraping concurrency to {concurrency} (proxies: {len(proxies)})")

        lead_queue = asyncio.Queue()
        worker_tasks = []

        # Start persistent browser workers
        for i in range(concurrency):
            proxy_to_use = proxies[i % len(proxies)] if proxies else None
            t = asyncio.create_task(self._persistent_browser_worker(user_id, lead_queue, proxy_to_use))
            worker_tasks.append(t)

        try:
            while self.workers.get(user_id):
                # 🚀 SELF-HEALING: Auto-Reset rate limits after a 12-hour cool-down!
                await db.execute("UPDATE instagram_accounts SET status = 'active' WHERE user_id = $1 AND status = 'rate_limited' AND last_used_at < NOW() - INTERVAL '12 hours'", user_id)

                # 🚀 PRIORITY INTERDICTION: If the user has queued manual-surges, launch those and pause analysis!
                next_in_queue = await db.fetchrow("""
                    SELECT id FROM instagram_leads 
                    WHERE user_id = $1 AND status = 'queued' 
                    ORDER BY updated_at ASC LIMIT 1
                """, user_id)
                
                if next_in_queue:
                    logger.info(f"🛰️ Priority Logic: Handing over to Queued Surge for lead {next_in_queue['id']}")
                    await self.harvest_lead_network(user_id, next_in_queue['id'], force_priority=True)
                    continue

                # Add discovered leads to queue if queue is below concurrency capacity
                current_qsize = lead_queue.qsize()
                if current_qsize < concurrency:
                    slots_available = concurrency - current_qsize
                    
                    leads_to_scrape = await db.fetch("""
                        SELECT id FROM instagram_leads 
                        WHERE user_id = $1 AND status = 'discovered' 
                        ORDER BY created_at DESC LIMIT $2
                    """, user_id, slots_available)

                    for l_row in leads_to_scrape:
                        lead_id = l_row["id"]
                        
                        # Lock lead immediately in DB to prevent duplicate parallel processing
                        await db.execute("UPDATE instagram_leads SET status = 'analyzing', updated_at = NOW() WHERE id = $1", lead_id)
                        
                        # Mark as analyzing/queued in UI immediately
                        try:
                            await manager.send_personal_message({
                                "type": "auto_analyze_started",
                                "lead_id": lead_id
                            }, user_id)
                        except: pass

                        # Push to queue
                        await lead_queue.put(lead_id)

                # If no active scraping tasks are running, no discovered leads left, and no pending_ai leads left, we are done!
                if lead_queue.empty():
                    has_more_discovered = await db.fetchval("SELECT EXISTS(SELECT 1 FROM instagram_leads WHERE user_id = $1 AND status = 'discovered')", user_id)
                    has_more_analyzing = await db.fetchval("SELECT EXISTS(SELECT 1 FROM instagram_leads WHERE user_id = $1 AND status = 'analyzing')", user_id)
                    
                    if not has_more_discovered and not has_more_analyzing:
                        logger.info(f"No more leads to analyze for User {user_id}. Auto-Pilot Resting. 😴")
                        try:
                            await manager.send_personal_message({
                                "type": "auto_analyze_stopped",
                                "status": "completed",
                                "message": "🏁 Mission Complete: All leads have been analyzed!"
                            }, user_id)
                        except: pass
                        break

                # Sleep a tiny bit to prevent pegging CPU in while loop
                await asyncio.sleep(0.5)

        except Exception as e:
            logger.error(f"Critical Auto-Pilot Worker failure: {e}")
        finally:
            self.workers[user_id] = False
            # Cancel all persistent browser tasks
            for t in worker_tasks:
                t.cancel()
            await asyncio.gather(*worker_tasks, return_exceptions=True)
            # Reset any leads stuck in 'analyzing' status back to 'discovered' so they can be tried again
            try:
                await db.execute("UPDATE instagram_leads SET status = 'discovered', updated_at = NOW() WHERE user_id = $1 AND status = 'analyzing'", user_id)
            except Exception as reset_err:
                logger.error(f"Failed to reset analyzing status on exit: {reset_err}")
            logger.info(f"Auto-Pilot Analysis Worker stopped for User {user_id}")

    async def _persistent_browser_worker(self, user_id: int, lead_queue: asyncio.Queue, proxy: Optional[dict]):
        """Runs a persistent browser instance, processing leads from the queue sequentially inside the same window."""
        from patchright.async_api import async_playwright
        import gc

        playwright_proxy = None
        if proxy and proxy.get('host'):
            server_prefix = "socks5://" if proxy.get("proxy_type") == "socks5" else "http://"
            playwright_proxy = {
                "server": f"{server_prefix}{proxy['host']}:{proxy['port']}",
            }
            if proxy.get('username'):
                playwright_proxy["username"] = proxy["username"]
                playwright_proxy["password"] = proxy["password"]

        # Chrome path
        chrome_path = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
        if not os.path.exists(chrome_path):
            chrome_path = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"

        launch_args = {
            "executable_path": chrome_path if os.path.exists(chrome_path) else None,
            "headless": False,
            "channel": "chrome",
            "proxy": playwright_proxy,
            "args": [
                "--window-state=minimized",
                "--no-first-run",
                "--no-default-browser-check",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-infobars",
                "--disable-blink-features=AutomationControlled"
            ]
        }

        # Keep worker running as long as autopilot is active
        while self.workers.get(user_id):
            try:
                # Wait for a lead to become available first before launching the browser!
                try:
                    lead_id = await asyncio.wait_for(lead_queue.get(), timeout=2.0)
                except asyncio.TimeoutError:
                    continue

                # We have a lead! Now launch the browser context
                logger.info(f"🚀 Worker starting browser dynamically for lead {lead_id}...")
                
                lead_processed = False
                try:
                    async with async_playwright() as p:
                        browser = None
                        context = None
                        page = None
                        try:
                            browser = await p.chromium.launch(**launch_args)
                            context = await browser.new_context(
                                user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
                                viewport={'width': 393, 'height': 852},
                                is_mobile=True,
                                has_touch=True,
                                locale="en-US"
                            )
                            page = await context.new_page()

                            # Process the first lead
                            try:
                                await self._scrape_and_pre_filter_lead_with_page(user_id, lead_id, page)
                            except Exception as e:
                                logger.error(f"Error scraping lead {lead_id}: {e}")
                                try:
                                    await db.execute("UPDATE instagram_leads SET status = 'failed', updated_at = NOW() WHERE id = $1", lead_id)
                                    await manager.send_personal_message({
                                        "type": "instagram_lead_updated",
                                        "lead_id": lead_id,
                                        "status": "failed",
                                        "current_action": f"Error: {str(e)}"
                                    }, user_id)
                                except: pass
                            finally:
                                lead_processed = True
                                lead_queue.task_done()

                            # Keep processing subsequent leads as long as they arrive quickly
                            idle_seconds = 0
                            while self.workers.get(user_id) and idle_seconds < 15:
                                try:
                                    sub_lead_id = await asyncio.wait_for(lead_queue.get(), timeout=1.0)
                                    idle_seconds = 0  # reset idle timer
                                    sub_lead_processed = False
                                    try:
                                        await self._scrape_and_pre_filter_lead_with_page(user_id, sub_lead_id, page)
                                        sub_lead_processed = True
                                    except Exception as e:
                                        logger.error(f"Error scraping lead {sub_lead_id}: {e}")
                                        try:
                                            await db.execute("UPDATE instagram_leads SET status = 'failed', updated_at = NOW() WHERE id = $1", sub_lead_id)
                                            await manager.send_personal_message({
                                                "type": "instagram_lead_updated",
                                                "lead_id": sub_lead_id,
                                                "status": "failed",
                                                "current_action": f"Error: {str(e)}"
                                            }, user_id)
                                        except: pass
                                    finally:
                                        lead_queue.task_done()
                                except asyncio.TimeoutError:
                                    idle_seconds += 1
                                    continue
                        except Exception as inner_err:
                            logger.error(f"Error in dynamic browser execution: {inner_err}")
                            # If browser launching failed and we hadn't processed the lead yet, reset it to discovered!
                            if not lead_processed:
                                try:
                                    await db.execute("UPDATE instagram_leads SET status = 'discovered', updated_at = NOW() WHERE id = $1", lead_id)
                                    await manager.send_personal_message({
                                        "type": "instagram_lead_updated",
                                        "lead_id": lead_id,
                                        "status": "discovered",
                                        "current_action": "Retrying (Browser launch failed)"
                                    }, user_id)
                                except: pass
                                lead_processed = True
                                lead_queue.task_done()
                        finally:
                            if page:
                                try: await asyncio.shield(page.close())
                                except: pass
                            if context:
                                try: await asyncio.shield(context.close())
                                except: pass
                            if browser:
                                try: await asyncio.shield(browser.close())
                                except: pass
                            gc.collect()
                except Exception as play_err:
                    logger.error(f"Playwright block exception: {play_err}")
                    if not lead_processed:
                        try:
                            await db.execute("UPDATE instagram_leads SET status = 'discovered', updated_at = NOW() WHERE id = $1", lead_id)
                            await manager.send_personal_message({
                                        "type": "instagram_lead_updated",
                                        "lead_id": lead_id,
                                        "status": "discovered",
                                        "current_action": "Retrying (Browser block failed)"
                                    }, user_id)
                        except: pass
                        lead_processed = True
                        lead_queue.task_done()
            except Exception as outer_err:
                logger.error(f"Outer worker exception: {outer_err}")
                await asyncio.sleep(2)

    async def _scrape_and_pre_filter_lead_with_page(self, user_id: int, lead_id: int, page):
        """
        Step 1: Scrapes profile using an already open Playwright page, runs non-AI pre-filters.
        Sets status to 'pending_ai' if qualified, or 'rejected' if disqualified, or 'private'/'error'/'failed'.
        """
        lead = await db.fetchrow("SELECT instagram_username, data_audit_json FROM instagram_leads WHERE id = $1 AND user_id = $2", lead_id, user_id)
        if not lead: return {"error": "Lead not found"}
        username = lead['instagram_username']

        async def update_ui(status: str, action: str = None):
            try:
                await manager.send_personal_message({
                    "type": "instagram_lead_updated",
                    "lead_id": lead_id,
                    "status": status,
                    "current_action": action
                }, user_id)
            except: pass

        # --- STEP 2 FIRST: Google Link AI Analysis ---
        settings = await self.get_filter_settings(user_id)
        enable_ai_filter = settings.get('enable_ai_filter', False)
        google_niche_filter = settings.get('google_niche_filter', '')
        ai_model = settings.get('ai_model', 'minimax-text-01')
        minimax_api_key = settings.get('minimax_api_key', '')

        audit = {}
        if lead['data_audit_json']:
            try:
                audit = json.loads(lead['data_audit_json']) if isinstance(lead['data_audit_json'], str) else lead['data_audit_json']
            except:
                audit = {}

        google_data = audit.get('google_snippet_data', {})
        if enable_ai_filter and google_niche_filter and google_data and not audit.get('google_ai_analyzed'):
            title = google_data.get('title', '')
            snippet = google_data.get('snippet', '')
            href = google_data.get('url', f"https://www.instagram.com/{username}/")
            
            if title or snippet:
                msg = f"🧠 [Auto-Pilot AI] Evaluating @{username} Google link first..."
                logger.info(msg)
                await update_ui("analyzing", msg)
                
                try:
                    res = await self._analyze_google_result_sequential(
                        title=title,
                        url=href,
                        snippet=snippet,
                        criteria=google_niche_filter,
                        model_choice=ai_model,
                        api_key=minimax_api_key
                    )
                    is_match = res.get("match", False)
                    reason = res.get("reason", "No reason provided.")
                    
                    audit['google_ai_analyzed'] = True
                    audit['google_ai_match'] = is_match
                    audit['google_ai_reason'] = reason
                    audit['rejection_reason'] = reason if not is_match else ""
                    
                    if not is_match:
                        logger.info(f"❌ [Auto-Pilot AI] Google data rejected @{username}: {reason}")
                        google_step = {
                            "step": "Deep AI Search Result Filter",
                            "status": "failed",
                            "details": f"Failed: {reason}"
                        }
                        audit['filter_trace'] = [google_step]
                        await db.execute("""
                            UPDATE instagram_leads 
                            SET status = 'google_rejected', data_audit_json = $1, updated_at = NOW() 
                            WHERE id = $2
                        """, json.dumps(audit), lead_id)
                        await update_ui("google_rejected", f"Failed: {reason}")
                        return {"success": True, "status": "google_rejected"}
                    else:
                        logger.info(f"✅ [Auto-Pilot AI] Google data matched @{username}. Saving and proceeding to scrape.")
                        await db.execute("""
                            UPDATE instagram_leads 
                            SET data_audit_json = $1 
                            WHERE id = $2
                        """, json.dumps(audit), lead_id)
                except Exception as ai_err:
                    logger.error(f"⚠️ Google AI pre-filter error: {ai_err}. Scraping profile anyway.")

        await update_ui("analyzing", "Scraping profile details...")

        try:
            logger.info(f"🕶️ Phase 1 Scraping (Persistent Browser): Capturing @{username}...")
            # Execute analysis action directly on our page
            result = await self._perform_anonymous_analysis(page, username)

            if not result or not result.get('success'):
                logger.warning(f"⚠️ Scraping failed for @{username}.")
                await db.execute("UPDATE instagram_leads SET status = 'failed', updated_at = NOW() WHERE id = $1", lead_id)
                await update_ui("failed", "Scraping failed")
                return {"success": False, "status": "failed"}

            bio = result.get('bio', '')
            followers = result.get('followers', 0)
            following = result.get('following', 0)
            full_name = result.get('full_name', username)
            posts = result.get('posts', [])
            is_private = result.get('is_private', False)

            # Not found check
            not_found_phrases = [
                'we are downloading the profile',
                'downloading the profile. please wait',
                'the page was not found',
                'page was not found',
                'profile not found',
                'user not found',
                'this account doesn\'t exist',
                'no posts yet',
                'account not found',
                'sorry, this page isn\'t available',
            ]
            bio_lower = bio.lower()
            if any(phrase in bio_lower for phrase in not_found_phrases):
                logger.warning(f"🚫 Lead {lead_id} shows a 'not found' page. Marking as 'error'.")
                await db.execute("UPDATE instagram_leads SET status = 'error', updated_at = NOW() WHERE id = $1", lead_id)
                await update_ui("error", "Profile not found")
                return {"success": True, "status": "error"}

            # If the page loads InstaCognito's default downloader home page instead of the profile, mark as failed
            if 'download videos, photos, reels & stories' in bio_lower and followers == 0:
                logger.warning(f"⚠️ Lead {lead_id} loaded InstaCognito landing page instead of profile. Marking as 'failed'.")
                await db.execute("UPDATE instagram_leads SET status = 'failed', updated_at = NOW() WHERE id = $1", lead_id)
                await update_ui("failed", "Loaded landing page instead of profile")
                return {"success": False, "status": "failed"}

            # Safety check
            if not bio and followers == 0 and following == 0:
                logger.warning(f"⚠️ Lead {lead_id} has NO data. Marking as 'failed' for retry.")
                await db.execute("UPDATE instagram_leads SET status = 'failed', updated_at = NOW() WHERE id = $1", lead_id)
                await update_ui("failed", "No data scraped")
                return {"success": False, "status": "failed"}

            # Handle private profile immediately
            if is_private:
                await db.execute("""
                    UPDATE instagram_leads 
                    SET status = 'private', bio = $1, follower_count = $2, following_count = $3, full_name = $4, recent_posts = '[]', is_private = TRUE, updated_at = NOW() 
                    WHERE id = $5
                """, bio, followers, following, full_name, lead_id)
                logger.info(f"🔒 Lead {lead_id} marked as PRIVATE.")
                await update_ui("private", "Private account")
                return {"success": True, "status": "private"}

            # Run fallback Google AI analysis if snippet-based analysis was skipped (e.g. legacy fallback or manually imported leads)
            if enable_ai_filter and google_niche_filter and not audit.get('google_ai_analyzed'):
                try:
                    title = f"Instagram Profile: {full_name or username}"
                    post_caps = [p.get('caption', '') for p in posts if isinstance(p, dict) and p.get('caption')]
                    posts_text = " | ".join(post_caps[:3])
                    snippet = f"Bio: {bio or ''}\nRecent Posts: {posts_text}"
                    
                    logger.info(f"⚡ Running fallback Google AI Filter using profile data for @{username}...")
                    res = await self._analyze_google_result_sequential(
                        title=title,
                        url=f"https://www.instagram.com/{username}/",
                        snippet=snippet,
                        criteria=google_niche_filter,
                        model_choice=ai_model,
                        api_key=minimax_api_key
                    )
                    is_match = res.get("match", False)
                    reason = res.get("reason", "No reason provided.")
                    
                    audit['google_ai_analyzed'] = True
                    audit['google_ai_match'] = is_match
                    audit['google_ai_reason'] = reason
                    audit['rejection_reason'] = reason if not is_match else ""
                    
                    if not is_match:
                        logger.info(f"❌ [Auto-Pilot AI] Fallback Google data rejected @{username}: {reason}")
                        google_step = {
                            "step": "Deep AI Search Result Filter",
                            "status": "failed",
                            "details": f"Failed: {reason}"
                        }
                        audit['filter_trace'] = [google_step]
                        await db.execute("""
                            UPDATE instagram_leads 
                            SET status = 'google_rejected', data_audit_json = $1, updated_at = NOW() 
                            WHERE id = $2
                        """, json.dumps(audit), lead_id)
                        await update_ui("google_rejected", f"Failed: {reason}")
                        return {"success": True, "status": "google_rejected"}
                    else:
                        logger.info(f"✅ [Auto-Pilot AI] Fallback Google data matched @{username}.")
                        # Save in DB and continue
                        await db.execute("""
                            UPDATE instagram_leads 
                            SET data_audit_json = $1 
                            WHERE id = $2
                        """, json.dumps(audit), lead_id)
                except Exception as ai_err:
                    logger.error(f"⚠️ Fallback Google AI pre-filter error: {ai_err}")

            # Run non-AI filters
            settings = await self.get_filter_settings(user_id)
            is_qualified, rejection_reason = self._check_non_ai_filters(bio, followers, full_name, username, settings)

            trace_steps = self._generate_pre_filter_trace(settings, bio, followers, full_name, username)
            
            # Prepend Google AI Filter step to the beginning
            google_status = "skipped"
            google_details = "Skipped because Google AI analysis was not executed."
            if audit.get('google_ai_analyzed'):
                google_status = "passed" if audit.get('google_ai_match') else "failed"
                google_details = f"Passed (Google AI Match: {audit.get('google_ai_reason', 'Matched criteria.')})" if audit.get('google_ai_match') else f"Failed: {audit.get('google_ai_reason', 'Mismatched.')}"
            elif not settings.get('enable_ai_filter'):
                google_status = "skipped"
                google_details = "Skipped because Deep AI Search Result Filter is not enabled in settings."
            
            google_step = {
                "step": "Deep AI Search Result Filter",
                "status": google_status,
                "details": google_details
            }
            trace_steps = [google_step] + trace_steps

            posts_json = json.dumps(posts or [])
            if not is_qualified:
                ai_analysis = audit.copy()
                ai_analysis.update({"rejection_reason": rejection_reason, "filter_trace": trace_steps})
                ai_data_json = json.dumps(ai_analysis)
                await db.execute("""
                    UPDATE instagram_leads 
                    SET status = 'rejected', bio = $1, follower_count = $2, following_count = $3, full_name = $4, 
                        recent_posts = $5, is_private = FALSE, score = 0, data_audit_json = $6, updated_at = NOW() 
                    WHERE id = $7
                """, bio, followers, following, full_name, posts_json, ai_data_json, lead_id)
                logger.info(f"❌ Lead {lead_id} rejected by pre-filters: {rejection_reason}")
                await update_ui("rejected", rejection_reason)
                return {"success": True, "status": "rejected", "rejection_reason": rejection_reason}

            # Passed pre-filters -> set status to pending_ai
            ai_analysis = audit.copy()
            ai_analysis.update({"filter_trace": trace_steps})
            ai_data_json = json.dumps(ai_analysis)
            await db.execute("""
                UPDATE instagram_leads 
                SET status = 'pending_ai', bio = $1, follower_count = $2, following_count = $3, full_name = $4, 
                    recent_posts = $5, is_private = FALSE, data_audit_json = $6, updated_at = NOW() 
                WHERE id = $7
            """, bio, followers, following, full_name, posts_json, ai_data_json, lead_id)
            logger.info(f"⏳ Lead {lead_id} passed pre-filters. Marked as pending_ai.")
            await update_ui("pending_ai", "Passed pre-filters, waiting for AI...")
            return {"success": True, "status": "pending_ai"}

        except Exception as e:
            logger.error(f"⚠️ Scraping phase failed for @{username}: {e}")
            await db.execute("UPDATE instagram_leads SET status = 'failed', updated_at = NOW() WHERE id = $1", lead_id)
            await update_ui("failed", str(e))
            return {"success": False, "status": "failed", "error": str(e)}

    async def start_auto_analysis(self, user_id: int):
        if self.workers.get(user_id):
            return {"status": "already_running"}
        
        self.workers[user_id] = True
        asyncio.create_task(self._analysis_worker(user_id))
        return {"status": "started"}

    async def stop_auto_analysis(self, user_id: int):
        self.workers[user_id] = False
        return {"status": "stopped"}

    async def get_worker_status(self, user_id: int):
        return {"is_running": self.workers.get(user_id, False)}

    async def get_discovery_status(self, user_id: int):
        return self._discovery_status.get(user_id, {"active": False, "progress": ""})

    # --- Stage 4: Outreach ---
    
    _campaign_tasks = {}
    _harvest_tasks = {} # user_id: current_lead_id
    _insta_clients = {}  # Cache logged-in clients for speed

    async def fix_account_statuses(self, user_id: int):
        """🚀 INDUSTRIAL RESET: Revives all non-banned accounts and purges the memory cache."""
        # 1. Database Revival
        await db.execute("UPDATE instagram_accounts SET status = 'active' WHERE status != 'banned' AND user_id = $1", user_id)
        
        # 2. Cache Purge: Force the engine to re-handshake every ghost
        accounts = await db.fetch("SELECT username FROM instagram_accounts WHERE user_id = $1", user_id)
        for acc in accounts:
            self._insta_clients.pop(acc['username'], None)
            
        logger.info(f"♻️ Global Ghost Reset Mission Complete for User {user_id}. All caches purged! ✨")
        return {"status": "fixed", "message": "All accounts reactivated and caches cleared! 🛸"}

    async def _get_insta_client(self, account_row):
        username = account_row['username']
        if username in self._insta_clients:
            return self._insta_clients[username]
        
        from instagrapi import Client
        import pyotp
        cl = Client()
        cl.delay_range = [2, 5]
        
        cl.set_device({
            "app_version": "385.0.0.47.74",
            "manufacturer": "Instagram",
            "model": "Web",
            "device": "Web",
        })
        cl.user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        
        # Proxy Support
        if account_row.get('host'):
            p_auth = f"{account_row['p_user']}:{account_row['p_pass']}@" if account_row.get('p_user') else ""
            p_url = f"{account_row['proxy_type']}://{p_auth}{account_row['host']}:{account_row['port']}"
            cl.set_proxy(p_url)
            
        try:
            session_id = account_row.get('session_id')
            v_code_raw = account_row.get('verification_code')
            v_code = None
            
            if v_code_raw:
                if len(v_code_raw.replace(" ", "")) > 10:
                    try:
                        totp = pyotp.TOTP(v_code_raw.replace(" ", ""))
                        v_code = totp.now()
                        logger.info(f"🔑 Autonomous 2FA: Generated fresh code {v_code} for @{username}")
                    except:
                        v_code = v_code_raw
                else:
                    v_code = v_code_raw

            # 💉 HYPER-PERSISTENCE: Try loading full browser state from dump
            if account_row.get('settings_dump'):
                try:
                    cl.set_settings(account_row['settings_dump'] if isinstance(account_row['settings_dump'], dict) else json.loads(account_row['settings_dump']))
                    if session_id:
                        cl.login_by_sessionid(session_id)
                    logger.info(f"⚡ Memory Recall: State restored for @{username}")
                except:
                    logger.warning(f"⚠️ State dump stale for @{username}, falling back...")
                    cl.login(username, account_row['password'], verification_code=v_code)
            elif session_id:
                try:
                    cl.login_by_sessionid(session_id)
                    logger.info(f"✨ Session Handshake successful for @{username}")
                except:
                    cl.login(username, account_row['password'], verification_code=v_code)
            else:
                cl.login(username, account_row['password'], verification_code=v_code)
            
            # --- MISSION SUCCESS: SAVE STATE ---
            new_dump = cl.get_settings()
            await db.execute("UPDATE instagram_accounts SET settings_dump = $1, updated_at = NOW() WHERE id = $2", json.dumps(new_dump), account_row['id'])
            
            self._insta_clients[username] = cl
            logger.info(f"✅ Ghost @{username} fully synchronized and ready.")
            return cl
        except Exception as e:
            logger.error(f"❌ Handshake failed for @{username}: {e}")
            await db.execute("UPDATE instagram_accounts SET status = 'error', updated_at = NOW() WHERE id = $1", account_row['id'])
            return None

    async def start_campaign(self, user_id: int, message_template: str):
        if user_id in self._campaign_tasks:
            return {"status": "already_running"}
        
        task = asyncio.create_task(self._campaign_worker(user_id, message_template))
        self._campaign_tasks[user_id] = task
        logger.info(f"🚀 Outreach Campaign STARTED for user {user_id}")
        return {"status": "started"}

    async def stop_campaign(self, user_id: int):
        task = self._campaign_tasks.pop(user_id, None)
        if task:
            task.cancel()
            logger.info(f"🛑 Outreach Campaign STOPPED for user {user_id}")
            return {"status": "stopped"}
        return {"status": "not_running"}

    async def get_campaign_status(self, user_id: int):
        return {"is_running": user_id in self._campaign_tasks}

    async def _campaign_worker(self, user_id: int, template: str):
        import random
        try:
            while True:
                # 1. Fetch next Ready lead
                lead = await db.fetchrow("""
                    SELECT * FROM instagram_leads 
                    WHERE user_id = $1 AND status IN ('analyzed', 'qualified') 
                    ORDER BY id ASC LIMIT 1
                """, user_id)
                
                if not lead:
                    logger.info("🏁 Campaign Complete: No more qualified leads found.")
                    break
                
                # 2. Pick a random Ghost Account with full details
                account = await db.fetchrow("""
            SELECT a.*, p.host, p.port, p.username as p_user, p.password as p_pass, p.proxy_type 
            FROM instagram_accounts a LEFT JOIN instagram_proxies p ON a.proxy_id = p.id
            WHERE a.user_id = $1 AND a.status = 'active'
            ORDER BY last_used_at ASC NULLS FIRST LIMIT 1
        """, user_id)
                
                if not account:
                    logger.warning("⚠️ Campaign Paused: No active ghost accounts found. Add accounts to continue.")
                    await asyncio.sleep(60)
                    continue

                cl = await self._get_insta_client(account)
                if not cl:
                    # Account might be flagged, try another in next loop
                    await asyncio.sleep(10)
                    continue

                username = lead['instagram_username']
                sender = account['username']
                
                # 3. Personalize Message
                personalized_msg = template.replace("[username]", f"@{username}")
                
                # 4. Human Jitter (Safe delay)
                delay = random.uniform(15, 30)
                logger.info(f"📤 Outreach Pilot: Sending DM to @{username} via ghost @{sender}. Jitter: {delay:.1f}s")
                await asyncio.sleep(delay)

                # 🚀 DM DELIVERY
                try:
                    loop = asyncio.get_event_loop()
                    user_id_to_dm = await loop.run_in_executor(
                        None, cl.user_id_from_username, username
                    )
                    await loop.run_in_executor(
                        None, cl.direct_send, personalized_msg, [int(user_id_to_dm)]
                    )
                    await db.execute(
                        "UPDATE instagram_leads SET status = 'contacted' WHERE id = $1",
                        lead['id']
                    )
                    logger.info(f"✅ DM SENT to @{username} via @{sender}.")
                except Exception as dm_error:
                    logger.error(f"❌ DM failed for @{username}: {dm_error}")
                    # Mark as analyzed so it's retried, not stuck
                    await asyncio.sleep(20)

        except asyncio.CancelledError:
            logger.info("Campaign worker cancelled.")
        except Exception as e:
            logger.error(f"Campaign worker encountered error: {e}")
        finally:
            self._campaign_tasks.pop(user_id, None)

    # --- GHOST SAFETY & BROWSER METHODS ---

    async def _check_for_challenge(self, page, account_data: dict):
        """
        Watchdog that scans for security puzzles, checkpoints, or verify prompts.
        If found, it signals for an immediate session abort and safety freeze.
        """
        try:
            url = page.url.lower()
            content = await page.content()
            content_lower = content.lower()

            challenge_phrases = [
                "suspicious activity", "verify your account", "help us confirm",
                "identity", "checkpoint", "challenge", "unusual activity",
                "confirm it's you", "solve a puzzle", "enter the code"
            ]
            
            # 1. URL Detection
            if any(x in url for x in ["checkpoint", "challenge", "verify", "suspended"]):
                logger.error(f"🚨 CHALLENGE DETECTED (URL): {url}")
                return True

            # 2. Page Content Detection
            if any(phrase in content_lower for phrase in challenge_phrases):
                logger.error(f"🚨 CHALLENGE DETECTED (Text Match): Security prompt found on page.")
                return True

            # 3. Specific DOM Elements (Puzzles/Buttons)
            challenge_selectors = [
                "canvas#captcha", "button:has-text('Send Code')", 
                "input[name='verificationCode']", "div[role='dialog'] h2:has-text('Confirm')"
            ]
            for sel in challenge_selectors:
                try:
                    if await page.query_selector(sel):
                        logger.error(f"🚨 CHALLENGE DETECTED (DOM): Found security element '{sel}'")
                        return True
                except: pass

            return False
        except Exception as e:
            logger.error(f"⚠️ Challenge watchdog error: {e}")
            return False

    async def _check_usage_limit(self, account_id: int):
        """Checks if the account has reached its daily limit of 10 sessions."""
        await self._reset_daily_usage_if_needed(account_id)
        row = await db.fetchrow("SELECT daily_usage_count FROM instagram_accounts WHERE id = $1", account_id)
        return row and row['daily_usage_count'] >= 10

    async def _reset_daily_usage_if_needed(self, account_id: int):
        """Resets the daily counter if 24 hours have passed since the last reset."""
        row = await db.fetchrow("SELECT last_usage_reset FROM instagram_accounts WHERE id = $1", account_id)
        if row and row['last_usage_reset']:
            from datetime import datetime, timedelta, timezone
            if datetime.now(timezone.utc) - row['last_usage_reset'] > timedelta(hours=24):
                await db.execute("UPDATE instagram_accounts SET daily_usage_count = 0, last_usage_reset = NOW() WHERE id = $1", account_id)

    async def _record_usage(self, account_id: int):
        """Increments the daily usage counter."""
        await db.execute("UPDATE instagram_accounts SET daily_usage_count = daily_usage_count + 1 WHERE id = $1", account_id)

    async def _freeze_account(self, account_id: int):
        """Places the account in a 36-hour safety hibernation."""
        from datetime import datetime, timedelta
        freeze_until = datetime.now() + timedelta(hours=36)
        await db.execute("UPDATE instagram_accounts SET status = 'frozen', frozen_until = $1 WHERE id = $2", freeze_until, account_id)
        logger.info(f"❄️ Account {account_id} frozen until {freeze_until}")

    # --- GHOST BROWSER ENGINE (HEADFUL HUMAN EMULATION) ---

    async def _perform_ghost_analysis(self, page, account_data):
        """Logic that runs INSIDE the real Chrome browser (Verified Ghost-Human Flow)."""
        target_username = account_data['target_username']
        account_username = account_data['username']
        
        # 1. Login if needed (Real Login Flow)
        await self._goto_instagram_home_and_login(page, account_data)

        # 📌 REGISTER ACTIVE PAGE for Smart Visibility
        self.active_pages[account_username] = page
        
        # 🚨 POST-LOGIN CHALLENGE CHECK
        if await self._check_for_challenge(page, account_data):
            raise InstagramChallengeException(f"🚨 CHALLENGE DETECTED for @{account_username} after login.")

        # 2. POPUP CLEARANCE & INITIAL SEASONING (1 Minute Human Scrolling)
        logger.info(f"⏳ Seasoning session for @{account_username} (1 Minute Human Mimicry)...")
        await self._perform_seasoning_scroll(page, account_username)

        # 🚨 POST-SEASONING CHALLENGE CHECK
        if await self._check_for_challenge(page, account_data):
            raise InstagramChallengeException(f"🚨 CHALLENGE DETECTED for @{account_username} after seasoning.")

        # 3. SEARCH & NAVIGATE (Searchbar Human Typing)
        await self._ghost_search_and_navigate(page, target_username)

        # 🚨 POST-NAVIGATION CHALLENGE CHECK
        if await self._check_for_challenge(page, account_data):
            raise InstagramChallengeException(f"🚨 CHALLENGE DETECTED for @{account_username} on target profile.")

    async def _perform_anonymous_analysis(self, page, target_username):
        """Playwright scraper using AnonyIG/Picuki — No login, reliable data."""
        # target_username is passed directly as a string from browser_engine

        # ─── STRATEGY A: InstaCognito (Search-based, reliable data) ───
        try:
            logger.info(f"🔍 Trying InstaCognito for @{target_username}...")
            await page.goto("https://instacognito.com/", wait_until="domcontentloaded", timeout=90000)
            await page.wait_for_timeout(random.randint(3000, 5000))

            # Type the profile URL into the search box
            search_input = await page.query_selector('input[type="text"], input[type="search"], input[placeholder*="search"], input[placeholder*="Instagram"], input[name*="search"], input[name*="url"]')
            if search_input:
                await search_input.click()
                await page.wait_for_timeout(1000)
                profile_url = f"https://www.instagram.com/{target_username}/"
                for char in profile_url:
                    await search_input.type(char, delay=random.randint(50, 100))
                await page.wait_for_timeout(1000)

                # Click the search/submit button
                search_btn = await page.query_selector('button[type="submit"], button:has-text("Search"), input[type="submit"], .search-btn, .btn-search, form button')
                if search_btn:
                    await search_btn.click()
                else:
                    await page.keyboard.press("Enter")

                # ── STEP 1: THE SEARCH WAIT (30s) ──
                logger.info(f"⏳ Waiting for InstaCognito to load @{target_username} (30s Search Wait)...")
                await asyncio.sleep(30) 

                # --- STEP 1.1: NOT FOUND CHECK ---
                not_found_detected = await page.evaluate("""() => {
                    const text = document.body.innerText.toLowerCase();
                    return text.includes('user not found') || 
                           text.includes('profile not found') || 
                           text.includes('not found') ||
                           text.includes('something went wrong');
                }""")
                if not_found_detected:
                    logger.warning(f"🚫 @{target_username} NOT FOUND on InstaCognito.")
                    return {"success": False, "error_type": "not_found"}

                # ── STEP 1.2: Read Profile Header (Bio/Stats) ──
                logger.info(f"👁️ Scrapping profile data for @{target_username}...")
                
                header_data = {"bio": "", "followers": "0", "following": "0", "is_private": False}
                
                for attempt in range(3): # Try 3 times to see data
                    header_data = await page.evaluate(r"""() => {
                        let bio = "", followers = "0", following = "0";

                        // Bio — try MANY more selectors
                        const bioSelectors = ['.biography', '.bio', '.description', '.about', '.profile-bio',
                                             '[class*="bio"]', '[class*="desc"]', '[class*="about"]', '.user-bio',
                                             '.profile-description', '.profile-details', '.user-description'];
                        for (const sel of bioSelectors) {
                            const el = document.querySelector(sel);
                            if (el && el.innerText.trim().length > 1) { bio = el.innerText.trim(); break; }
                        }
                        
                        // Counts — scan full page text or specific stats
                        const fullText = document.body.innerText;
                        const followerMatch = fullText.match(/([\d,]+\.?\d*[KkMm]?)\s*[Ff]ollowers?/i);
                        const followingMatch = fullText.match(/([\d,]+\.?\d*[KkMm]?)\s*[Ff]ollowing/i);
                        
                        if (followerMatch) followers = followerMatch[1];
                        else {
                            // Try selector based extraction
                            const statVals = document.querySelectorAll('.stat-value, .count, .number, .stat-counter, .stats-item span');
                            statVals.forEach(v => {
                                const p = v.parentElement?.innerText?.toLowerCase() || "";
                                if (p.includes('follower')) followers = v.innerText;
                                if (p.includes('following')) following = v.innerText;
                            });
                        }
                        
                        if (followingMatch && following === "0") following = followingMatch[1];

                        // Private check
                        const pageText = document.body.innerText.toLowerCase();
                        const is_private = pageText.includes('private account') || 
                                           pageText.includes('you have entered the link to a private account') ||
                                           document.querySelector('.private-profile, .is-private, i.fa-lock') !== null;

                        return { bio, followers, following, is_private };
                    }""")
                    
                    # If we found followers or bio, we are good!
                    if header_data["bio"] or (header_data["followers"] != "0" and header_data["followers"] != ""):
                        break
                    
                    logger.info(f"⏳ Data not ready yet for @{target_username} (Attempt {attempt+1}/3), waiting...")
                    await page.wait_for_timeout(3000)

                bio = header_data.get('bio', '').strip()
                is_private = header_data.get('is_private', False)
                followers_raw = header_data.get('followers', '0')
                following_raw = header_data.get('following', '0')

                # ── STEP 2: Handle Private Accounts Immediately ──
                if is_private:
                    logger.info(f"🔒 @{target_username} is PRIVATE. Bio captured, stopping here.")
                    def parse_count_local(txt):
                        m = re.search(r'([\d.,]+)\s*([KkMm]?)', str(txt))
                        if not m: return 0
                        val = float(m.group(1).replace(',', ''))
                        suffix = m.group(2).upper()
                        if suffix == 'M': return int(val * 1_000_000)
                        if suffix == 'K': return int(val * 1_000)
                        return int(val)
                    
                    return {
                        "success": True, 
                        "bio": bio, 
                        "followers": parse_count_local(followers_raw), 
                        "following": parse_count_local(following_raw),
                        "full_name": target_username, 
                        "posts": [], 
                        "is_private": True
                    }

                # ── STEP 3: Public Account — The "Nudge" & Post Wait ──
                logger.info(f"✅ @{target_username} is PUBLIC — nudging page down...")
                await page.evaluate("window.scrollBy(0, 300)") # A little nudge
                
                logger.info("⏳ Waiting for posts to appear (15s Post Wait)...")
                await asyncio.sleep(15) 

                # Final scroll to ensure they are visible
                await page.evaluate("window.scrollBy(0, 600)")
                await asyncio.sleep(2)

                # ── STEP 4: Extract Posts with Native Screenshots ──
                profile_img_src = await page.evaluate("""() =>
                    document.querySelector('img.profile-pic, img.avatar, .profile-image img, .user-avatar img')?.src || ""
                """)

                posts_data = []
                seen_srcs = set()
                img_selectors = [
                    '.post img', '.media img', '.grid img',
                    'article img', '.item img',
                    '[class*="post"] img', '[class*="media"] img',
                    'img[src*="cdninstagram"]'
                ]

                # Nudge again to make sure loaded
                await page.evaluate("window.scrollBy(0, 300)")
                await asyncio.sleep(1)

                logger.info("📸 Screenshotting posts natively to capture exact pixels...")
                for sel in img_selectors:
                    if len(posts_data) >= 3:
                        break
                    try:
                        elements = await page.query_selector_all(sel)
                        for el in elements:
                            if len(posts_data) >= 3:
                                break
                            
                            src = await el.get_attribute('src')
                            if not src or src in seen_srcs or src == profile_img_src:
                                continue
                                
                            # Check size in browser
                            box = await el.bounding_box()
                            if not box or box['width'] < 60 or box['height'] < 60:
                                continue
                                
                            # Check if video
                            is_video = await page.evaluate("""(img) => {
                                const parent = img.closest('[class*="post"], article, [class*="media"], li');
                                return !!(parent && parent.querySelector('video, [class*="video"], svg[aria-label*="Video"]'));
                            }""", el)
                            if is_video:
                                continue
                            
                            try:
                                # Native Playwright screenshot of the image element
                                img_bytes = await el.screenshot(type="jpeg", timeout=4000)
                                import base64
                                img_b64 = base64.b64encode(img_bytes).decode('utf-8')
                                posts_data.append({
                                    "display_url": src,
                                    "caption": "",
                                    "b64_data": img_b64
                                })
                                seen_srcs.add(src)
                                logger.info(f"✅ Successfully screenshotted post image: {src[:50]}...")
                            except Exception as ss_err:
                                logger.warning(f"Screenshot failed for {src[:50]}: {ss_err}")
                                # Fallback to URL-only if screenshot fails
                                posts_data.append({
                                    "display_url": src,
                                    "caption": ""
                                })
                                seen_srcs.add(src)
                    except Exception as e:
                        logger.warning(f"Error checking selector {sel}: {e}")

                def parse_count(txt):
                    if not txt: return 0
                    # Remove commas and clean whitespace
                    clean_txt = str(txt).replace(',', '').strip()
                    # Match number and optional K/M suffix (handling decimals)
                    m = re.search(r'([\d\.]+)\s*([KkMm]?)', clean_txt)
                    if not m: return 0
                    
                    try:
                        val = float(m.group(1))
                        suffix = m.group(2).upper()
                        if suffix == 'M': return int(val * 1_000_000)
                        if suffix == 'K': return int(val * 1_000)
                        return int(val)
                    except: return 0

                followers = parse_count(followers_raw)
                following = parse_count(following_raw)

                return {
                    "success": True, 
                    "bio": bio, 
                    "followers": followers, 
                    "following": following,
                    "full_name": target_username, 
                    "posts": posts_data, 
                    "is_private": False
                }

        except Exception as e:
            logger.warning(f"⚠️ AnonyIG analysis failed for @{target_username}: {e}")
            return {"success": False, "error_type": "crash"}

        return {"success": False, "error_type": "unknown"}

    # --- Data Utils ---

        # Final fallback: visit instagram.com and just extract whatever is visible
        try:
            logger.info(f"🕵️ Last resort: Visiting instagram.com/{ target_username} directly...")
            await page.goto(f"https://www.instagram.com/{target_username}/", wait_until="load", timeout=30000)
            await page.wait_for_timeout(4000)

            # Try clicking X on any popup
            try:
                x_btn = await page.query_selector('[aria-label="Close"], [aria-label="close"]')
                if x_btn: await x_btn.click(); await page.wait_for_timeout(1500)
            except: pass

            # Grab all visible text and extract what we can
            raw_text = await page.evaluate("() => document.body.innerText")
            bio_match = re.search(r'(?:following|followers)\n(.+?)(?:\n\d|\nPosts|$)', raw_text, re.S | re.I)
            bio = bio_match.group(1).strip() if bio_match else ""
            fol_match = re.search(r'([\d.,KMkm]+)\s*[Ff]ollowers?', raw_text)
            followers = parse_count(fol_match.group(1)) if fol_match else 0

            if bio or followers > 0:
                return {"success": True, "bio": bio, "followers": followers, "following": 0,
                        "full_name": target_username, "posts": [], "is_private": False}
        except Exception as e:
            logger.error(f"❌ All anonymous strategies failed for @{target_username}: {e}")

        return {"success": False}


    async def _goto_instagram_home_and_login(self, page, account_data):
        """Shared helper: Go to Instagram home, login if needed, clear popups."""
        logger.info(f"🌐 Navigating to Instagram Home for @{account_data['username']}...")
        await page.goto("https://www.instagram.com/", wait_until="load", timeout=60000)
        await page.wait_for_timeout(random.randint(5000, 8000))

        # 🚨 PRE-LOGIN CHALLENGE CHECK
        if await self._check_for_challenge(page, account_data):
            raise InstagramChallengeException(f"🚨 CHALLENGE DETECTED for @{account_data['username']} at Home.")

        # 📱 MOBILE SPLASH SCREEN CHECK
        try:
            login_btn = await page.query_selector('button:has-text("Log in"), a:has-text("Log in"), button:has-text("Sign in"), span:has-text("Log in")')
            if login_btn and await login_btn.is_visible():
                logger.info("📱 Detected mobile splash screen. Clicking Log in...")
                await login_btn.click()
                await page.wait_for_timeout(random.randint(3000, 5000))
        except: pass

        # 🕵️ Detect if we are already logged in
        is_logged_in = False
        try:
            feed = await page.query_selector('svg[aria-label="Home"], svg[aria-label="New Post"], a[href="/"]')
            if feed and await feed.is_visible():
                is_logged_in = True
                logger.info(f"✨ Session recognized for @{account_data['username']} (Already logged in).")
        except: pass

        if not is_logged_in:
            # Check for credentials input
            user_input = await page.query_selector('input[name="email"], input[name="username"], input[aria-label*="username"]')
            if user_input:
                logger.info(f"🔑 Logging in as @{account_data['username']}...")
                await user_input.click()
                await page.keyboard.press("Control+A") # Clear existing
                await page.keyboard.press("Backspace")
                await self._human_type(page, account_data['username'])
                await asyncio.sleep(random.uniform(1, 2))
                
                pass_input = await page.query_selector('input[name="pass"], input[name="password"], input[aria-label*="password"]')
                if pass_input:
                    await pass_input.click()
                    await self._human_type(page, account_data['password'])
                    await asyncio.sleep(1)
                    
                    # Try Enter first
                    await page.keyboard.press("Enter")
                    
                    # 🖱️ EXPLICIT CLICK: If Enter didn't work, smash the Log In button!
                    try:
                        submit_btn = await page.query_selector('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Confirm"), div[role="button"]:has-text("Log in")')
                        if submit_btn and await submit_btn.is_visible():
                            logger.info("🖱️ Clicking explicit Log In/Confirm button...")
                            await submit_btn.click()
                    except: pass
                    
                    await page.wait_for_timeout(10000)

                # ✅ CHECK: Did login FAIL?
                wrong_pass = await page.query_selector('div:has-text("Sorry, your password was incorrect"), div:has-text("The password you entered is incorrect"), #slfErrorAlert, div[data-testid="login-error-message"]')
                if wrong_pass:
                    err_text = await wrong_pass.inner_text()
                    logger.error(f"❌ Login FAILED for @{account_data['username']}: {err_text.strip()}")
                    await db.execute("UPDATE instagram_accounts SET status = 'error', updated_at = NOW() WHERE username = $1", account_data['username'])
                    raise Exception(f"Login failed for @{account_data['username']}: Wrong credentials")

                # 🛡️ Handle 2FA (Multi-Variant)
                logger.info("🛡️ Scanning for 2FA Security Checkpoint...")
                await page.wait_for_timeout(5000)
                
                two_fa = await page.query_selector('input[name="verificationCode"], input[aria-label="Security Code"], input[placeholder="Code"], input[aria-label="Code"], input[aria-label*="digit"]')
                split_boxes = await page.query_selector_all('input[autocomplete="one-time-code"], input[id*="verificationCode"]')
                
                fa_secret = account_data.get('fa_secret') or account_data.get('verification_code')
                
                if (two_fa or (split_boxes and len(split_boxes) > 0)) and fa_secret:
                    logger.info("🔐 2FA detected! Generating code from secret...")
                    import pyotp
                    try:
                        totp = pyotp.TOTP(fa_secret.strip().replace(" ", ""))
                        code = totp.now()
                        if len(code) == 6:
                            if two_fa:
                                await two_fa.click()
                                await page.keyboard.press("Control+A")
                                await page.keyboard.press("Backspace")
                                for char in code:
                                    await page.keyboard.press(char)
                                    await asyncio.sleep(0.2)
                            elif split_boxes:
                                for idx, char in enumerate(code):
                                    if idx < len(split_boxes):
                                        await split_boxes[idx].fill(char)
                                        await asyncio.sleep(0.1)
                            
                            await page.keyboard.press("Enter")
                            await page.wait_for_timeout(10000)
                    except Exception as e:
                        logger.error(f"❌ 2FA Generation failed: {e}")

        # 🧹 Popup Clearance (Save Info, Not Now, etc.)
        for _ in range(3):
            for btn_text in ["Not Now", "Not now", "Allow", "Save Info", "Turn On", "Dismiss"]:
                try:
                    btn = await page.query_selector(f'button:has-text("{btn_text}"), div[role="button"]:has-text("{btn_text}")')
                    if btn and await btn.is_visible():
                        await btn.click()
                        await page.wait_for_timeout(2000)
                except: pass

    async def _perform_seasoning_scroll(self, page, username):
        """1 minute of human-like home feed scrolling to normalize the session."""
        start_time = time.time()
        while time.time() - start_time < 60: 
            await page.mouse.wheel(0, random.randint(400, 800))
            await asyncio.sleep(random.uniform(3, 7))
            if random.random() < 0.3:
                await asyncio.sleep(random.randint(5, 10))

    async def _ghost_search_and_navigate(self, page, target_username):
        """Use the search bar to find the target, mimicking human navigation."""
        logger.info(f"🔎 Human-Like Search for @{target_username}...")
        search_icon = await page.query_selector('a[href="/explore/"], svg[aria-label="Search"]')
        if search_icon:
            await search_icon.click()
            await page.wait_for_timeout(2000)
            search_input = await page.query_selector('input[placeholder="Search"], input[aria-label="Search input"]')
            if search_input:
                await self._human_type(page, target_username)
                await page.wait_for_timeout(4000)
                result = await page.query_selector(f'a[href="/{target_username}/"]')
                if result:
                    await result.click()
                else:
                    await page.keyboard.press("Enter")
                await page.wait_for_timeout(5000)
        else:
            await page.goto(f"https://www.instagram.com/{target_username}/", wait_until="networkidle")

    async def _human_type(self, page, text: str):
        """Types like a human with variable delays."""
        import random
        for char in text:
            await page.keyboard.press(char)
            await asyncio.sleep(random.uniform(0.1, 0.3))

    async def _check_for_challenge(self, page, account_data: dict) -> bool:
        """🚨 CHALLENGE WATCHDOG (Shared with Warmer)"""
        try:
            current_url = page.url.lower()
            
            # 1. URL Detection
            danger_urls = ['/challenge/', '/checkpoint/', '/suspended/', '/unusualactivity/']
            if any(d in current_url for d in danger_urls):
                logger.warning(f"🚨 CHALLENGE DETECTED (URL Match): {current_url}")
                return True

            # 2. Content Detection
            body_text = await page.evaluate("() => document.body?.innerText || ''")
            challenge_phrases = [
                'verify your identity', 'confirm your identity', 
                'suspicious login', 'temporarily locked', 
                'account suspended', 'unusual login attempt',
                'confirm this was you', 'puzzle', 'select all images'
            ]
            body_lower = body_text.lower()
            if any(p in body_lower for p in challenge_phrases):
                logger.warning("🚨 CHALLENGE DETECTED (Text Match): Security prompt found on page.")
                return True
            
            # 3. Element Detection
            challenge_selectors = ['img[src*="challenge"]', 'div:has-text("Verify your identity")', 'input[name="email"]', 'input[name="phone"]']
            for sel in challenge_selectors:
                try:
                    el = await page.query_selector(sel)
                    if el and await el.is_visible():
                        logger.warning(f"🚨 CHALLENGE DETECTED (Element Match): {sel}")
                        return True
                except: pass

            return False
        except: return False

    async def _perform_easycomment_harvest(self, page, target_username):
        """Anonymous harvest via InstaCognito."""
        # target_username is passed directly as a string from browser_engine.run_anonymous_session
        url = "https://instacognito.com/en/followed"
        logger.info(f"🛰️ Navigating to {url} (High-Stealth Mobile)...")
        
        try:
            # 1. Direct Navigation with Retry
            await page.goto(url, wait_until="networkidle", timeout=60000)
            await page.wait_for_timeout(3000) 

            # 🚨 BLANK PAGE WATCHDOG: If page is empty, force a reload
            body_len = await page.evaluate("() => document.body.innerText.length")
            if body_len < 100:
                logger.warning("⚠️ Detected possible blank page. Attempting forced reload...")
                await page.reload(wait_until="networkidle")
                await page.wait_for_timeout(4000)

            # 2. Handle Security Check (I am human) if it appears
            logger.info("🛡️ Checking for security boxes/popups...")
            captcha_selectors = [
                'iframe[title*="hCaptcha"]', 'iframe[title*="reCAPTCHA"]', 
                '.h-captcha', '.g-recaptcha', 'div:has-text("I am human")',
                'input[type="checkbox"]'
            ]
            
            for selector in captcha_selectors:
                try:
                    element = await page.query_selector(selector)
                    if element and await element.is_visible():
                        logger.info(f"🧩 Found security element: {selector}. Clicking...")
                        await element.click()
                        await page.wait_for_timeout(5000)
                except: pass

            # 2. Find Search Input and Type Target Username
            logger.info(f"✍️ Searching for Username: {target_username}")
            
            input_selectors = [
                'input[placeholder*="username"]',
                'input[placeholder*="Instagram"]',
                'input[placeholder*="URL"]',
                'input[type="text"]',
                'input[name*="username"]'
            ]
            
            input_found = False
            for sel in input_selectors:
                search_input = await page.query_selector(sel)
                if search_input and await search_input.is_visible():
                    await search_input.click()
                    await page.wait_for_timeout(500)
                    for char in target_username:
                        await search_input.type(char, delay=random.randint(50, 100))
                    input_found = True
                    break
            
            if not input_found:
                logger.error("❌ Could not find search input on InstaCognito")
                return {"success": False}

            # 3. Trigger Search (Use Enter like the test script)
            logger.info(f"🔍 Triggering search for @{target_username}...")
            await page.keyboard.press("Enter")
            
            # 4. Wait for Profile and click Followers (Red Dot Area)
            logger.info("⏳ Waiting for profile page to load...")
            # Use a longer wait and simpler check like the script
            await page.wait_for_timeout(7000) 

            logger.info("🔴 Attempting to click the Followers Red Dot area...")
            clicked_status = await page.evaluate(r"""() => {
                const elements = Array.from(document.querySelectorAll('div, span, a, p'));
                const followersEl = elements.find(el => 
                    el.innerText.toLowerCase().trim() === 'followers' && 
                    el.children.length === 0
                );

                if (followersEl) {
                    const container = followersEl.parentElement;
                    if (container) {
                        container.click();
                        return 'parent_clicked';
                    }
                    followersEl.click();
                    return 'element_clicked';
                }
                return 'not_found';
            }""")
            
            logger.info(f"🖱️ Click status: {clicked_status}")
            if clicked_status == 'not_found':
                logger.warning("⚠️ Followers area not found, checking backup...")
                # Try clicking any element containing "followers" and a number
                await page.evaluate(r"""() => {
                    const el = Array.from(document.querySelectorAll('*')).find(e => 
                        /\d+\s*followers/i.test(e.innerText)
                    );
                    if (el) el.click();
                }""")
            
            await page.wait_for_timeout(6000) # Give list time to open

            # 5. Slow, deliberate scroll to the end with capture-as-you-go
            logger.info("📜 Starting slow-motion harvest...")
            usernames = set()
            consecutive_no_new = 0
            
            for scroll_round in range(50): # Deep scroll
                current_count = len(usernames)
                
                # Capture current visible names (Universal Text Extractor)
                page_data = await page.evaluate(r"""() => {
                    const results = [];
                    const all = document.querySelectorAll('div, span, h5, h4, h3, a');
                    all.forEach(el => {
                        const text = el.innerText.trim();
                        // Instagram pattern: 3-30 chars, alphanumeric, dots, underscores
                        if (/^[a-z0-9._]{3,30}$/i.test(text)) {
                            results.push(text.toLowerCase());
                        }
                    });
                    return results;
                }""")
                
                for name in page_data:
                    # Filter out system noise
                    if name not in ['profile', 'en', 'followed', 'search', 'results', 'posts', 'followers', 'following', 'highlights', 'reels', 'stories']:
                        if name not in usernames:
                            usernames.add(name)

                # Slow, small scrolls
                await page.mouse.wheel(0, random.randint(250, 400))
                await asyncio.sleep(random.uniform(2.0, 3.5))
                
                if len(usernames) == current_count:
                    consecutive_no_new += 1
                else:
                    consecutive_no_new = 0
                
                # Smart Stop: If no new names found after 3 scrolls, we hit the end
                if consecutive_no_new >= 3 and scroll_round > 5:
                    logger.info("DONE: No new followers found after 3 scrolls. End of list reached.")
                    break
                    
                logger.info(f"   Harvesting... {len(usernames)} unique names so far.")

            logger.info(f"🎯 Harvest Complete: Total {len(usernames)} leads found.")
            return {"success": True, "usernames": list(usernames)}

        except Exception as e:
            logger.error(f"❌ InstaCognito mission failed: {e}")
            return {"success": False}

    async def _perform_ghost_harvest(self, page, account_data):
        """Full human-like Ghost session: Login → Season → Search → Open Followers → Harvest."""
        target_username = account_data['target_username']
        ghost_username = account_data['username']

        # ── STEP 1: Login ──
        logger.info(f"🔐 Ghost @{ghost_username} logging in...")
        await self._goto_instagram_home_and_login(page, account_data)
        self.active_pages[ghost_username] = page

        # ── STEP 2: Season the session (scroll feed like a human, 45-60 seconds) ──
        logger.info(f"🌊 @{ghost_username} seasoning feed before mission...")
        await self._perform_seasoning_scroll(page, ghost_username)

        # ── STEP 3: Search for target using the search bar (NOT direct URL) ──
        logger.info(f"🔎 @{ghost_username} searching for @{target_username}...")
        try:
            # Click search icon in sidebar
            search_icon = await page.query_selector('a[href*="search"], svg[aria-label*="Search"], [aria-label*="Search"]')
            if search_icon:
                await search_icon.click()
                await page.wait_for_timeout(random.randint(1500, 2500))

            # Find the search input and type naturally
            search_box = await page.query_selector('input[placeholder*="Search"], input[type="text"]')
            if search_box:
                await search_box.click()
                await page.wait_for_timeout(random.randint(500, 1000))
                for char in target_username:
                    await search_box.type(char, delay=random.randint(80, 180))
                await page.wait_for_timeout(random.randint(2000, 3000))

                # Click the matching result from dropdown
                result = await page.query_selector(f'a[href="/{target_username}/"], a:has-text("{target_username}")')
                if result:
                    await result.click()
                    await page.wait_for_timeout(random.randint(3000, 5000))
                else:
                    # Fallback: press Enter and navigate
                    await page.keyboard.press("Enter")
                    await page.wait_for_timeout(3000)
                    await page.goto(f"https://www.instagram.com/{target_username}/", wait_until="networkidle", timeout=30000)
            else:
                # Direct URL fallback
                await page.goto(f"https://www.instagram.com/{target_username}/", wait_until="networkidle", timeout=30000)
        except Exception as e:
            logger.warning(f"⚠️ Search navigation failed: {e}. Using direct URL...")
            await page.goto(f"https://www.instagram.com/{target_username}/", wait_until="networkidle", timeout=30000)

        await page.wait_for_timeout(random.randint(3000, 5000))  # "Reading" the profile

        # ── STEP 4: Open Followers modal ──
        logger.info(f"👥 Opening followers list for @{target_username}...")
        followers_link = await page.query_selector(f'a[href="/{target_username}/followers/"], a:has-text("followers")')
        if not followers_link:
            logger.warning(f"⚠️ Could not find followers link for @{target_username}")
            self.active_pages.pop(ghost_username, None)
            return {"success": False}

        await followers_link.click()
        await page.wait_for_timeout(random.randint(4000, 6000))  # Wait for dialog to fully open
        await page.wait_for_timeout(2000)  # Extra wait for list to populate

        # ── STEP 5: Scroll followers and harvest usernames ──
        logger.info(f"📜 Harvesting followers of @{target_username}...")
        usernames = set()
        no_new_count = 0

        for scroll_round in range(30):  # Max 30 scroll rounds → ~150 followers
            # Extract usernames via href regex — most reliable method for Instagram
            names = await page.evaluate(r"""() => {
                const dialog = document.querySelector('div[role="dialog"]');
                if (!dialog) return { names: [], debug: 'no_dialog' };

                // Get ALL links inside the dialog
                const allLinks = Array.from(dialog.querySelectorAll('a[href]'));
                const names = [];

                allLinks.forEach(link => {
                    const href = link.getAttribute('href') || '';
                    // Instagram follower hrefs look like: /username/ or /username
                    const match = href.match(/^\/([A-Za-z0-9._]{1,30})\/?$/);
                    if (match && match[1]) {
                        names.push(match[1]);
                    }
                });

                return { names, debug: `links=${allLinks.length}` };
            }""")

            if scroll_round == 0:
                logger.info(f"   🔬 Dialog debug: {names.get('debug', 'unknown')}")

            prev_count = len(usernames)
            skip = {ghost_username.lower(), target_username.lower(), 'explore', 'reels', 'p', 'tv', 'stories', 'direct'}
            for n in names.get('names', []):
                clean = n.strip().lower()
                if clean and clean not in skip:
                    usernames.add(clean)

            if len(usernames) >= 150:
                logger.info(f"✅ Reached 150 followers. Stopping.")
                break

            if len(usernames) == prev_count:
                no_new_count += 1
                if no_new_count >= 5:
                    logger.info(f"🛑 No new followers after {no_new_count} scrolls. Done.")
                    break
            else:
                no_new_count = 0

            # Scroll the innermost scrollable container inside the dialog
            scrolled = await page.evaluate("""() => {
                const dialog = document.querySelector('div[role="dialog"]');
                if (!dialog) return false;
                // Find the scrollable child (the list container)
                const scrollable = Array.from(dialog.querySelectorAll('*')).find(el => {
                    const style = window.getComputedStyle(el);
                    return (style.overflowY === 'scroll' || style.overflowY === 'auto') && el.scrollHeight > el.clientHeight;
                });
                const target = scrollable || dialog;
                target.scrollTop += Math.floor(Math.random() * 400 + 300);
                return !!scrollable;
            }""")

            if not scrolled:
                # Fallback: mouse wheel on dialog center
                dialog_el = await page.query_selector('div[role="dialog"]')
                if dialog_el:
                    box = await dialog_el.bounding_box()
                    if box:
                        await page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
                        await page.mouse.wheel(0, random.randint(400, 700))

            await asyncio.sleep(random.uniform(1.5, 3.0))
            logger.info(f"   scroll {scroll_round+1}: {len(usernames)} unique followers so far...")

        self.active_pages.pop(ghost_username, None)
        logger.info(f"🎯 Harvest Complete: {len(usernames)} followers collected for @{target_username}")
        return {"success": True, "usernames": list(usernames)}

    def _check_maturation(self, session_count: int, required_phase: int):
        """Ensures the scraper account is mature enough for the task."""
        if required_phase == 1: return True # Everyone can login
        if required_phase == 2: return session_count >= 7
        if required_phase == 3: return session_count >= 14
        if required_phase == 4: return session_count >= 21
        return False

    async def deduplicate_leads(self, user_id: int):
        """
        🧹 Purge duplicate Instagram leads for a user.
        Keeps the most complete record (highest follower_count, or latest discovered).
        Returns count of removed duplicates.
        """
        # Find all duplicate usernames
        dupes = await db.fetch("""
            SELECT instagram_username, COUNT(*) as cnt, 
                   array_agg(id ORDER BY follower_count DESC NULLS LAST, created_at DESC) as ids
            FROM instagram_leads
            WHERE user_id = $1
            GROUP BY instagram_username
            HAVING COUNT(*) > 1
        """, user_id)

        removed = 0
        for row in dupes:
            ids = row['ids']
            keep_id = ids[0]          # Keep the most complete one (highest followers)
            delete_ids = ids[1:]      # Delete the rest
            if delete_ids:
                await db.execute(
                    "DELETE FROM instagram_leads WHERE id = ANY($1::int[]) AND user_id = $2",
                    delete_ids, user_id
                )
                removed += len(delete_ids)

        logger.info(f"🧹 Deduplicated {removed} duplicate leads for user {user_id}")
        return {"status": "ok", "removed": removed, "message": f"✅ Removed {removed} duplicate leads."}


instagram_service = InstagramService()
