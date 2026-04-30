import os
import httpx
import re
import json
import logging
import asyncio
import random
from urllib.parse import quote
from typing import List, Optional
from database import db
from websocket_manager import manager
import PIL.Image
import imagehash
import time
from datetime import datetime
from .browser_engine import browser_engine

# 🚨 SMART TELEMETRY
logging.basicConfig(level=logging.INFO, format='%(levelname)s:     %(message)s')
logger = logging.getLogger(__name__)

class InstagramChallengeException(Exception):
    """Custom exception raised when an Instagram security challenge is detected."""
    pass

class InstagramWarmingService:
    """
    TOTAL ISOLATION MODULE: Instagram Warming
    This service is a separate replica of the lead generator logic.
    It has 0 connection to the main instagram_leads tables.
    """

    _insta_clients = {}  # Cache logged-in clients for speed
    _harvest_tasks = {} # user_id: current_lead_id
    workers = {} # user_id: bool (auto-pilot)
    nap_end_times = {} # user_id: float (timestamp of when the nap finishes)
    paused_accounts = set() # account usernames currently in human-control mode
    active_pages = {}  # username: playwright page object (for smart resume)

    # 🎭 GHOST-HUMAN BIOS (100+ variations for unique identity)
    HUMAN_BIOS = [
        "Exploring life one photo at a time 🌎", "Coffee enthusiast and code lover ☕", 
        "Living life in color 🌈", "Just another dreamer ✨", "Capturing memories 📸", 
        "Traveler | Foodie | Life lover", "Digital nomad living the dream 🏝️", 
        "Stay humble, hustle hard 💪", "Creating my own sunshine ☀️", "Simple life, big dreams",
        "Art, music, and good vibes only ✌️", "Work hard, travel harder ✈️", 
        "Tech geek and movie lover 🎬", "Born to explore 🏔️", "Stay curious 🔍",
        "Adventure is out there!", "Life is a journey, not a destination", 
        "Striving for progress, not perfection 📈", "Grateful for every moment", "Peace & Love 🕊️",
        "Minimalist & Mindfulness seeker 🌿", "Chasing sunsets and new horizons 🌅",
        "Bookworm & Coffee addict 📖", "Making history, not following it 🕰️",
        "Urban explorer 🏙️", "Mountain soul, ocean heart 🌊", "Let the adventure begin!",
        "Happiness is a choice 😊", "Focus on the good ✨", "Doing what I love ❤️"
    ]

    async def _ghost_log(self, msg, type="info", page=None, account_username=None):
        """Broadcasting logs to both terminal and Browser HUD."""
        # Clean terminal logging
        log_msg = msg
        if type == 'error': logger.error(log_msg)
        elif type == 'warn': logger.warning(log_msg)
        else: logger.info(log_msg)

        # HUD Broadcasting
        if not page and account_username:
            page = self.active_pages.get(account_username)
        
        if page:
            try:
                # Sanitize for JS string
                safe_msg = msg.replace('"', "'").replace('\n', ' ').strip()
                await page.evaluate(f"window.showGhostLog && window.showGhostLog(\"{safe_msg}\", \"{type}\")")
            except: pass

    async def get_proxies(self, user_id: int):
        rows = await db.fetch("SELECT * FROM instagram_warming_proxies WHERE user_id = $1 ORDER BY id ASC", user_id)
        return [dict(row) for row in rows]

    async def discover_leads_google(self, user_id: int, keywords: List[str], limit_per_keyword: int = 50):
        discovery_results = []
        new_count = 0
        proxies_list = await self.get_proxies(user_id)
        
        # 🕵️ Random Agents for stealth
        agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ]
        
        for kw_idx, keyword in enumerate(keywords):
            # Rotate proxy per keyword
            p_url = None
            if proxies_list:
                p = proxies_list[kw_idx % len(proxies_list)]
                p_auth = f"{p['username']}:{p['password']}@" if p['username'] else ""
                p_url = f"{p['proxy_type']}://{p_auth}{p['host']}:{p['port']}"

            # 🛠️ Direct Username Detection (If it's a single word with _ or .)
            kw_clean = keyword.strip().lstrip('@')
            if ' ' not in kw_clean and len(kw_clean) > 3:
                logger.info(f"🎯 Instagram Warmer: Direct Username Detected: @{kw_clean}")
                status = await db.execute("INSERT INTO instagram_warming_leads (user_id, instagram_username, discovery_keyword, status) VALUES ($1, $2, $3, 'discovered') ON CONFLICT DO NOTHING", user_id, kw_clean, "direct_add")
                if status == "INSERT 0 1": new_count += 1

            # 🛠️ Multi-Page Discovery Mission
            current_kw_results = 0
            for page in range(0, 3): # Scrape 3 pages deep for maximum reach
                if current_kw_results >= limit_per_keyword: break
                
                mirrors = [
                    f"https://www.google.com/search?q={quote(f'site:instagram.com \"{keyword}\"')}&start={page*10}",
                    f"https://www.bing.com/search?q={quote(f'site:instagram.com \"{keyword}\"')}&first={page*10 + 1}",
                    f"https://html.duckduckgo.com/html/?q={quote(f'site:instagram.com \"{keyword}\"')}" if page == 0 else None
                ]

                for search_url in filter(None, mirrors):
                    success = False
                    headers = {"User-Agent": random.choice(agents), "Accept-Language": "en-US,en;q=0.9"}
                    
                    # ATTEMPT 1: With Proxy
                    try:
                        async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=15.0, proxy=p_url) as client:
                            res = await client.get(search_url)
                            if res.status_code == 200:
                                # 🔍 Robust extraction (Path + URL Encoded Path)
                                raw_matches = re.findall(r'instagram\.com/([a-zA-Z0-9._]{3,30})', res.text)
                                redirect_matches = re.findall(r'instagram\.com%2F([a-zA-Z0-9._]{3,30})', res.text)
                                
                                all_matches = list(set(raw_matches + redirect_matches))
                                logger.info(f"IG Warmer Scan: Found {len(all_matches)} potential leads on {search_url}")

                                for u in all_matches:
                                    u_clean = u.lower().strip('./_ ')
                                    # 🛑 Filter Platform Noise
                                    if u_clean and u_clean not in {'reels', 'about', 'legal', 'terms', 'privacy', 'p', 'explore', 'stories', 'p.photos'}:
                                        if len(u_clean) > 2:
                                            status = await db.execute("INSERT INTO instagram_warming_leads (user_id, instagram_username, discovery_keyword, status) VALUES ($1, $2, $3, 'discovered') ON CONFLICT DO NOTHING", user_id, u_clean, keyword)
                                            if status == "INSERT 0 1": 
                                                new_count += 1
                                                current_kw_results += 1
                                success = True
                    except Exception as e:
                        logger.warning(f"IG Warmer Proxy fail on {search_url}: {e}")

                    # ATTEMPT 2: Local Bypass (If Proxy failed or returned empty)
                    if not success:
                        try:
                            async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=12.0) as client:
                                res = await client.get(search_url)
                                if res.status_code == 200:
                                    matches = re.findall(r'instagram\.com/([a-zA-Z0-9._]{3,30})', res.text)
                                    for u in set(matches):
                                        u_clean = u.lower().strip('./_ ')
                                        if u_clean and u_clean not in {'reels', 'about', 'legal', 'terms', 'privacy', 'p', 'explore', 'stories'}:
                                            status = await db.execute("INSERT INTO instagram_warming_leads (user_id, instagram_username, discovery_keyword, status) VALUES ($1, $2, $3, 'discovered') ON CONFLICT DO NOTHING", user_id, u_clean, keyword)
                                            if status == "INSERT 0 1": 
                                                new_count += 1
                                                current_kw_results += 1
                        except: pass

                    # 🌬️ BREATHE: Human pattern delay
                    await asyncio.sleep(random.uniform(2.5, 4.8))
            
            # Mission Breathe: Deeper pause between different keywords
            if kw_idx < len(keywords) - 1:
                await asyncio.sleep(random.uniform(6.0, 10.0))

        logger.info(f"📊 Warmer Discovery Mission Summary: {new_count} NEW leads deployed to pool.")
        return new_count

    async def get_leads(self, user_id: int, status: str = None, limit: int = 500, offset: int = 0):
        query = "SELECT * FROM instagram_warming_leads WHERE user_id = $1"
        params = [user_id]
        if status:
            params.append(status)
            query += f" AND status = ${len(params)}"
        query += f" ORDER BY updated_at DESC LIMIT {limit} OFFSET {offset}"
        try:
            rows = await db.fetch(query, *params)
            return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Error in get_leads: {e}")
            logger.error(f"Query: {query}")
            logger.error(f"Params: {params}")
            raise

    async def get_accounts(self, user_id: int):
        rows = await db.fetch("SELECT i.*, p.host as proxy_host FROM instagram_warming_accounts i LEFT JOIN instagram_warming_proxies p ON i.proxy_id = p.id WHERE i.user_id = $1", user_id)
        accounts = []
        for row in rows:
            acc = dict(row)
            username = acc['username']
            acc['is_active'] = username in self.active_pages
            acc['is_paused'] = username in self.paused_accounts
            accounts.append(acc)
        return accounts

    async def add_account(self, user_id: int, account_data):
        await db.execute("""
            INSERT INTO instagram_warming_accounts (user_id, username, password, proxy_id, status, warming_session_count)
            VALUES ($1, $2, $3, $4, 'active', 0)
            ON CONFLICT (username) DO UPDATE SET
                password = EXCLUDED.password,
                proxy_id = EXCLUDED.proxy_id,
                status = 'active',
                created_at = NOW(),
                warming_session_count = 0,
                updated_at = NOW()
        """, user_id, account_data.username, account_data.password, account_data.proxy_id)
        
        # 🚨 Emergency Wake-Up Override
        self.nap_end_times[user_id] = 0
        return {"status": "success"}

    async def delete_account(self, user_id: int, account_id: int):
        await db.execute("DELETE FROM instagram_warming_accounts WHERE id = $1 AND user_id = $2", account_id, user_id)
        return {"status": "success"}

    async def add_proxy(self, user_id: int, proxy_data):
        await db.execute("""
            INSERT INTO instagram_warming_proxies (user_id, host, port, username, password, proxy_type) 
            VALUES ($1, $2, $3, $4, $5, $6)
        """, user_id, proxy_data.host, proxy_data.port, proxy_data.username, proxy_data.password, proxy_data.proxy_type)
        return {"status": "success"}

    async def delete_proxy(self, user_id: int, proxy_id: int):
        await db.execute("UPDATE instagram_warming_accounts SET proxy_id = NULL WHERE proxy_id = $1", proxy_id)
        await db.execute("DELETE FROM instagram_warming_proxies WHERE id = $1", proxy_id)
        return {"status": "success"}

    async def get_settings(self, user_id: int):
        row = await db.fetchrow("SELECT * FROM instagram_warming_settings WHERE user_id = $1", user_id)
        if row: return dict(row)
        return {"user_id": user_id, "bio_keywords": "", "min_followers": 0, "max_followers": 0}

    async def save_settings(self, user_id: int, settings_data):
        await db.execute("""
            INSERT INTO instagram_warming_settings (user_id, bio_keywords, min_followers, max_followers, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (user_id) DO UPDATE SET
                bio_keywords = EXCLUDED.bio_keywords,
                min_followers = EXCLUDED.min_followers,
                max_followers = EXCLUDED.max_followers,
                updated_at = NOW()
        """, user_id, settings_data.bio_keywords, settings_data.min_followers, settings_data.max_followers)
        return {"status": "success"}

    # --- Engine Auto-Pilot (Warming & Aging) ---
    async def log_activity(self, account_id: int, log_type: str, message: str):
        """Records a social event in the account's history journal."""
        try:
            await db.execute("""
                INSERT INTO instagram_warming_logs (account_id, log_type, message, created_at)
                VALUES ($1, $2, $3, NOW())
            """, account_id, log_type, message)
        except Exception as e:
            logger.error(f"❌ Failed to write activity log: {e}")

    async def get_account_logs(self, user_id: int, account_id: int, limit: int = 50):
        """Fetches the latest activity logs for a specific Warming account."""
        # Check ownership first
        account = await db.fetchrow("SELECT id FROM instagram_warming_accounts WHERE id = $1 AND user_id = $2", account_id, user_id)
        if not account:
            return []
        
        rows = await db.fetch("""
            SELECT id, log_type, message, created_at 
            FROM instagram_warming_logs 
            WHERE account_id = $1 
            ORDER BY created_at DESC 
            LIMIT $2
        """, account_id, limit)
        return [dict(row) for row in rows]

    async def _auto_pilot_worker(self, user_id: int):
        logger.info(f"🛸 Warming Auto-Pilot Sector Active for User {user_id}")
        try:
            while self.workers.get(user_id):
                # 1. Obey Pre-existing Global Nap
                while self.nap_end_times.get(user_id, 0) > time.time() and self.workers.get(user_id):
                    remaining_raw = self.nap_end_times[user_id] - time.time()
                    try:
                        await manager.send_personal_message({
                            "type": "warming_autopilot_nap_sync",
                            "nap_end_time": self.nap_end_times[user_id]
                        }, user_id)
                    except: pass
                    await asyncio.sleep(min(1, remaining_raw))

                if not self.workers.get(user_id): break

                # --- 📡 DEEP HIBERNATION CHECK ---
                try:
                    exhaustion_time = await self._get_fleet_exhaustion_wakeup(user_id)
                    if exhaustion_time:
                        nap_duration = exhaustion_time - time.time()
                        if nap_duration > 0:
                            self.nap_end_times[user_id] = exhaustion_time
                            logger.info(f"💤 Fleet Exhausted: Deep Hibernation for {int(nap_duration)}s...")
                            try:
                                await manager.send_personal_message({
                                    "type": "warming_autopilot_nap_sync",
                                    "nap_end_time": self.nap_end_times[user_id]
                                }, user_id)
                            except: pass
                            continue
                except Exception as e:
                    logger.error(f"⚠️ Hibernation Check Failed: {e}. Defaulting to safety nap.")
                    continue

                # 🎭 PURE WARMING MODE: Bypass all scraping/harvesting
                # We prioritize Daily Seasoning (Warming) for all eligible accounts
                account_to_warm = await self._get_available_ghost(user_id)
                
                if account_to_warm:
                    logger.info(f"🎭 Auto-Pilot: Triggering Daily Seasoning for Account {account_to_warm['id']}...")
                    await self.manual_warmup_account(user_id, account_to_warm['id'])
                else:
                    logger.info(f"😴 Warming Fleet Resting: All active accounts have finished their 24h sessions.")
                    if self.nap_end_times.get(user_id, 0) < time.time():
                        await manager.send_personal_message({"type": "warming_autopilot_idle", "message": "Fleet Resting: All accounts seasoned for today."}, user_id)
                    await asyncio.sleep(60)
                    continue

                # 🛌 THE GLOBAL NAP: Random cooldown between 2-3 minutes after every warming session
                nap_duration = random.randint(120, 180)
                logger.info(f"🛌 Engine Nap: Fleet taking a human break for {nap_duration}s...")
                
                self.nap_end_times[user_id] = time.time() + nap_duration
                try:
                    await manager.send_personal_message({
                        "type": "warming_autopilot_nap_sync",
                        "nap_end_time": self.nap_end_times[user_id]
                    }, user_id)
                except: pass

                    
        except Exception as e:
            logger.error(f"❌ Warming Auto-Pilot Worker CRASHED: {e}")
        finally:
            self.workers[user_id] = False
            logger.info(f"🛸 Warming Auto-Pilot Sector Shutdown for User {user_id}")

    async def _get_fleet_exhaustion_wakeup(self, user_id: int):
        # 1. Reset daily limits if 24 hours have passed (COALESCE handles migration gaps)
        await db.execute("""
            UPDATE instagram_warming_accounts 
            SET daily_usage_count = 0, last_usage_reset = NOW()
            WHERE user_id = $1 
              AND (last_usage_reset IS NULL OR last_usage_reset < NOW() - INTERVAL '24 hours')
              AND daily_usage_count > 0
        """, user_id)
        
        # 2. Check if ANY account is available right now (< 1 session today)
        available = await db.fetchval("""
            SELECT COUNT(id) FROM instagram_warming_accounts 
            WHERE user_id = $1 
              AND status IN ('active', 'error', 'frozen') 
              AND daily_usage_count < 1
              AND (frozen_until IS NULL OR frozen_until < NOW())
        """, user_id)
        
        if available > 0:
            return None # Ghosts are ready for duty
            
        # 3. Fleet Exhausted! Find the SOONEST time any ghost recovers.
        soonest = await db.fetchval("""
            SELECT MIN(
                LEAST(
                   CASE WHEN daily_usage_count >= 1 THEN COALESCE(last_usage_reset, created_at, NOW()) + INTERVAL '24 hours' ELSE 'infinity'::timestamp END,
                   CASE WHEN frozen_until IS NOT NULL AND frozen_until > NOW() THEN frozen_until ELSE 'infinity'::timestamp END
                )
            )
            FROM instagram_warming_accounts 
            WHERE user_id = $1 AND status IN ('active', 'error', 'frozen')
        """, user_id)
        
        if not soonest or soonest == 'infinity' or (hasattr(soonest, 'year') and soonest.year == 9999):
            return time.time() + 300 # Total failure or empty fleet -> Safety Nap
            
        return soonest.timestamp()

    async def start_auto_pilot(self, user_id: int):
        if self.workers.get(user_id): return {"status": "already_running"}
        self.workers[user_id] = True
        asyncio.create_task(self._auto_pilot_worker(user_id))
        return {"status": "started"}

    async def stop_auto_pilot(self, user_id: int):
        self.workers[user_id] = False
        return {"status": "stopped"}

    async def update_account(self, user_id: int, account_id: int, data: dict):
        # Filter for valid fields
        valid_fields = {'verification_code', 'status', 'password', 'proxy_id', 'session_id'}
        updates = {k: v for k, v in data.items() if k in valid_fields}
        
        if not updates: return {"status": "no_updates"}
        
        set_clause = ", ".join([f"{k} = ${i+3}" for i, k in enumerate(updates.keys())])
        values = list(updates.values())
        
        await db.execute(f"""
            UPDATE instagram_warming_accounts 
            SET {set_clause}, updated_at = NOW() 
            WHERE id = $1 AND user_id = $2
        """, account_id, user_id, *values)
        
        # Invalidate cache if password/session changed
        row = await db.fetchrow("SELECT username FROM instagram_warming_accounts WHERE id = $1", account_id)
        if row and row['username'] in self._insta_clients:
            del self._insta_clients[row['username']]
            
        return {"status": "success"}

    async def _get_available_ghost(self, user_id, used_ids=[]):
        """🛡️ SAFETY VALVE: Automatically resets daily counts and picks a ghost within limits."""
        # 1. Reset daily counts for accounts that have passed their 24h window
        await db.execute("""
            UPDATE instagram_warming_accounts 
            SET daily_usage_count = 0, last_usage_reset = NOW()
            WHERE user_id = $1 AND last_usage_reset < NOW() - INTERVAL '24 hours'
        """, user_id)

        # 2. Find a ghost that is active, NOT hit 1-session-limit, and NOT frozen
        account = await db.fetchrow(f"""
            SELECT a.*, p.host as proxy_host, p.port as proxy_port, p.username as proxy_user, p.password as proxy_pass, p.proxy_type 
            FROM instagram_warming_accounts a LEFT JOIN instagram_warming_proxies p ON a.proxy_id = p.id
            WHERE a.user_id = $1 
              AND a.status IN ('active', 'error', 'frozen') 
              AND a.daily_usage_count < 1
              AND (a.frozen_until IS NULL OR a.frozen_until < NOW())
            {"AND a.id NOT IN (" + ",".join(map(str, used_ids)) + ")" if used_ids else ""}
            ORDER BY CASE WHEN a.status = 'active' THEN 0 WHEN a.status = 'frozen' THEN 1 ELSE 2 END ASC, updated_at ASC NULLS FIRST LIMIT 1
        """, user_id)
        
        return account

    async def _get_account_age_days(self, account_data):
        """Calculates how many days ago the account was added to the system."""
        created_at = account_data.get('created_at')
        if not created_at:
            return 31 # Assume old if date missing
        
        delta = datetime.now() - created_at
        return max(0, delta.days)

    async def _get_dynamic_daily_limit(self, session_count):
        """
        🚀 30-DAY GHOST MATURATION CURVE
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        Phase 1 — Incubation   (Days  1-7):  ZERO scraping. Pure social only.
        Phase 2 — Socialite    (Days  8-14): Low volume. 5-12 leads/day.
        Phase 3 — Operative    (Days 15-21): Medium. 15-25 leads/day.
        Phase 4 — Mature       (Days 22-30): Full speed. 30-45 leads/day.
        Seasoned               (Days 30+):   Maximum safe. 50-75 leads/day.
        """
        if session_count < 7:   return 0                        # Phase 1: Zero scraping
        if session_count < 14:  return random.randint(5, 12)    # Phase 2: Slow start
        if session_count < 21:  return random.randint(15, 25)   # Phase 3: Building trust
        if session_count < 30:  return random.randint(30, 45)   # Phase 4: Ramping up
        return random.randint(50, 75)                            # Seasoned: Full power

    async def _human_mouse_move(self, page, target_x: int, target_y: int, steps: int = 15):
        """Moves the mouse in a cubic Bezier curve to simulate human muscle movement."""
        start_x, start_y = await page.evaluate("() => [window.mouseX || 0, window.mouseY || 0]")
        
        cp1_x = start_x + (target_x - start_x) * random.uniform(0.1, 0.4) + random.randint(-50, 50)
        cp1_y = start_y + (target_y - start_y) * random.uniform(0.1, 0.4) + random.randint(-50, 50)
        cp2_x = start_x + (target_x - start_x) * random.uniform(0.6, 0.9) + random.randint(-50, 50)
        cp2_y = start_y + (target_y - start_y) * random.uniform(0.6, 0.9) + random.randint(-50, 50)

        # 💡 Slowed down for visual tracking (Human Visibility)
        for i in range(steps + 1):
            t = i / steps
            x = (1-t)**3 * start_x + 3*(1-t)**2 * t * cp1_x + 3*(1-t) * t**2 * cp2_x + t**3 * target_x
            y = (1-t)**3 * start_y + 3*(1-t)**2 * t * cp1_y + 3*(1-t) * t**2 * cp2_y + t**3 * target_y
            await page.mouse.move(x, y)
            await page.evaluate(f"window.mouseX = {x}; window.mouseY = {y};")
            await asyncio.sleep(random.uniform(0.02, 0.05)) # Increased delay for visibility
        
        logger.info(f"   🏁 Arrived at ({int(target_x)}, {int(target_y)})")

    async def _human_swipe(self, page, distance: int, account_id: int = None):
        """Simulates a real human thumb flick with dual-action (Touch Events + Physical Scroll)."""
        start_x = random.randint(150, 250)
        start_y = random.randint(600, 800)
        
        await self._ghost_log(f"🖐️ Flicking thumb up {distance}px...", page=page)
        if account_id:
            await self.log_activity(account_id, "interaction", f"🖐️ Flicked thumb up {distance}px (Mobile Gesture)")
        
        # 1. Physical Scroll Force (Ensures visual movement in Home Feed)
        try:
            await page.evaluate(f"window.scrollBy({{ top: {distance}, behavior: 'smooth' }});")
        except: pass

        # 2. Visual Touch Sensors (Stealthed for IG detection)
        try:
            await page.evaluate(f"""(() => {{
                const el = document.elementFromPoint({start_x}, {start_y}) || document.body;
                const touchObj = new Touch({{
                    identifier: Date.now(),
                    target: el,
                    clientX: {start_x},
                    clientY: {start_y},
                    radiusX: 10,
                    radiusY: 10,
                    rotationAngle: 10,
                    force: 0.5
                }});

                el.dispatchEvent(new TouchEvent('touchstart', {{
                    bubbles: true, cancelable: true, touches: [touchObj]
                }}));
                
                el.dispatchEvent(new TouchEvent('touchmove', {{
                    bubbles: true, cancelable: true, touches: [touchObj]
                }}));
                
                el.dispatchEvent(new TouchEvent('touchend', {{
                    bubbles: true, cancelable: true
                }}));
            }})()""")
        except: pass
        
        # 3. Visual Thumb Movement for the User
        await page.mouse.move(start_x, start_y)
        await page.mouse.down()
        await page.mouse.move(start_x, start_y - (distance // 2), steps=10)
        await page.mouse.up()
        await asyncio.sleep(random.uniform(1.2, 2.5))

    async def _human_click(self, page, selector, account_id: int = None):
        """Clicks with curve movement and 'Bot-Acting' flag for sensor bypass."""
        try:
            btn = await page.wait_for_selector(selector, timeout=10000)
            if btn:
                # 🛡️ TELL BROWSER WE ARE ACTING
                await page.evaluate("window.isBotActing = true")
                
                box = await btn.bounding_box()
                if box:
                    center_x = box['x'] + box['width'] / 2
                    center_y = box['y'] + box['height'] / 2
                    logger.info(f"   🎯 TARGET SPOTTED: {selector}. Moving to click center...")
                    await self._human_mouse_move(page, center_x, center_y)
                    await asyncio.sleep(random.uniform(0.4, 0.8))
                    await page.mouse.click(center_x, center_y)
                    logger.info(f"   🖱️ CLICK LANDED on {selector}.")
                    if account_id:
                        await self.log_activity(account_id, "interaction", f"🎯 Tapped UI Element: {selector}")
                else:
                    await btn.click()
                
                await asyncio.sleep(random.uniform(0.5, 1.5))
                # 🏁 BRAKE
                await page.evaluate("window.isBotActing = false")
                return True
        except Exception as e:
            await page.evaluate("window.isBotActing = false")
            return False

    async def _randomly_update_profile(self, page, account_data):
        """Randomly updates bio or profile info to build trust (5% chance)."""
        if random.random() > 0.05: return 
        
        logger.info(f"👤 @{account_data['username']} is feeling creative. Updating profile...")
        try:
            # 1. Click Profile icon
            await self._human_click(page, 'a[href*="/' + account_data['username'] + '/"]')
            await asyncio.sleep(random.uniform(3, 6))
            
            # 🖼️ CHECK FOR PROFILE PIC UPLOAD: 10% chance if folder has pics
            if random.random() < 0.10:
                pic_dir = "profile_pics"
                if os.path.exists(pic_dir):
                    pics = [f for f in os.listdir(pic_dir) if f.endswith(('.jpg', '.jpeg', '.png'))]
                    if pics:
                        selected_pic = os.path.join(os.getcwd(), pic_dir, random.choice(pics))
                        logger.info(f"   🖼️ Uploading new profile picture: {pics[0]}")
                        # Look for "Change profile photo" button
                        change_btn = await page.query_selector('button:has-text("Change Profile Photo"), button:has-text("Change profile photo")')
                        if change_btn:
                            await change_btn.click() # Click to open menu
                            await asyncio.sleep(2)
                            # Playwright handles the file input automatically if we find it
                            file_input = await page.query_selector('input[type="file"]')
                            if file_input:
                                await file_input.set_input_files(selected_pic)
                                await page.wait_for_timeout(random.randint(5000, 8000))

            # 2. Click Edit Profile for Bio
            edit_btn = 'a[href="/accounts/edit/"]'
            if await self._human_click(page, edit_btn):
                await page.wait_for_timeout(random.randint(5000, 8000))
                
                # 3. Randomize Bio if it's too short/empty
                bio_input = await page.query_selector('textarea')
                if bio_input:
                    current_bio = await bio_input.inner_text()
                    if len(current_bio) < 5 or random.random() < 0.15:
                        new_bio = random.choice(self.HUMAN_BIOS)
                        logger.info(f"   ✍️ Setting new bio: {new_bio}")
                        await bio_input.click()
                        # Select all and delete
                        await page.keyboard.down('Control')
                        await page.keyboard.press('a')
                        await page.keyboard.up('Control')
                        await page.keyboard.press('Backspace')
                        await self._human_type(page, new_bio)
                        
                        # Save (Find the submit button)
                        submit = await page.query_selector('button[type="submit"]:has-text("Submit"), div[role="button"]:has-text("Submit")')
                        if submit:
                            await self._human_click(page, 'button[type="submit"], div[role="button"]:has-text("Submit")')
                            await page.wait_for_timeout(4000)
            
            # Go back Home
            await page.goto("https://www.instagram.com/", wait_until="load")
        except Exception as e:
            logger.error(f"⚠️ Profile update failed for @{account_data['username']}: {e}")

    async def _human_type(self, page, text: str, account_id: int = None, delay_range: tuple = (100, 300)):
        """Simulates human typing with variable speed and occasional typos/backspaces."""
        if not text: return
        
        await self._ghost_log(f"⌨️ Typing: {text[:15]}...", page=page)
        
        if account_id:
            await self.log_activity(account_id, "interaction", f"⌨️ Typing: {text[:20]}...")
            
        for char in text:
            if not char or not isinstance(char, str): continue 
            
            # 5% chance of a typo
            if random.random() < 0.05:
                wrong_char = random.choice("abcdefghijklmnopqrstuvwxyz")
                await self._ghost_log(f"✍️ Typo: '{wrong_char}' (Fixing...)", page=page)
                try:
                    await page.keyboard.type(wrong_char, delay=random.randint(50, 150))
                    await asyncio.sleep(random.uniform(0.1, 0.3))
                    await page.keyboard.press("Backspace")
                    await asyncio.sleep(random.uniform(0.2, 0.4))
                except: pass
            
            try:
                await page.keyboard.type(char, delay=random.randint(20, 50))
            except Exception as e:
                await self._ghost_log(f"⚠️ Keyboard Fallback for '{char}': {e}", type="warn", page=page)
                await page.keyboard.insert_text(char)
                
            await asyncio.sleep(random.uniform(delay_range[0] / 1000, delay_range[1] / 1000))

    async def pause_session(self, user_id: int, account_id: int):
        """🎮 Human takes control. Bot pauses for this account."""
        account = await db.fetchrow("SELECT username FROM instagram_warming_accounts WHERE id = $1 AND user_id = $2", account_id, user_id)
        if not account:
            return {"status": "error", "message": "Account not found"}
        username = account['username']
        self.paused_accounts.add(username)
        logger.info(f"🎮 Human control activated for @{username}. Bot is paused.")
        return {"status": "paused", "username": username}

    async def resume_session(self, user_id: int, account_id: int):
        """🤖 Bot resumes. Smart page-aware: checks where we are and navigates back."""
        account = await db.fetchrow("SELECT username FROM instagram_warming_accounts WHERE id = $1 AND user_id = $2", account_id, user_id)
        if not account:
            return {"status": "error", "message": "Account not found"}
        username = account['username']
        self.paused_accounts.discard(username)
        
        # Smart Resume: If we have an active page, check URL and navigate home
        page = self.active_pages.get(username)
        if page:
            try:
                current_url = page.url
                logger.info(f"🤖 Bot resuming for @{username}. Currently at: {current_url}")
                # If not on main instagram feed, navigate back
                if 'instagram.com' in current_url and current_url != 'https://www.instagram.com/':
                    logger.info(f"   📍 Detected non-feed page. Navigating back to home...")
                    await page.goto("https://www.instagram.com/", wait_until="load")
                    await page.wait_for_timeout(3000)
            except Exception as e:
                logger.warning(f"⚠️ Smart resume navigation failed: {e}")
        
        logger.info(f"🤖 Bot control restored for @{username}.")
        return {"status": "resumed", "username": username}

    async def _check_human_intervention(self, page, account_username: str):
        """Checks if the account is paused via the UI. If paused, waits until resumed."""
        if account_username in self.paused_accounts:
            logger.info(f"⏸️ @{account_username} is in human-control mode. Bot waiting...")
            # Ensure the UI reflects the bot is waiting
            while account_username in self.paused_accounts:
                await asyncio.sleep(1)  # High-frequency check
            logger.info(f"▶️ @{account_username} resumed! Bot taking back control...")
            
            # After resume, ensure we are still on IG and not blocked
            try:
                await page.wait_for_timeout(2000)
                if "instagram.com" not in page.url:
                    await page.goto("https://www.instagram.com/", wait_until="load")
            except: pass
            return True
        return False

    async def _smart_sleep(self, duration: float, page, account_username: str):
        """Sleeps while continuously checking for human pause/intervention."""
        start_time = asyncio.get_event_loop().time()
        while asyncio.get_event_loop().time() - start_time < duration:
            # Check for pause
            await self._check_human_intervention(page, account_username)
            # Check for sudden browser close
            if page.is_closed():
                raise Exception("Browser closed during sleep.")
            
            remaining = duration - (asyncio.get_event_loop().time() - start_time)
            sleep_step = min(1.0, remaining) if remaining > 0 else 0
            if sleep_step > 0:
                await asyncio.sleep(sleep_step)

    async def _check_for_challenge(self, page, account_data: dict) -> bool:
        """
        🚨 INSTAGRAM CHALLENGE WATCHDOG
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        Detects security checkpoints, puzzles, and identity challenges.
        If triggered: ABORT SESSION + FREEZE ACCOUNT for 36 hours.
        Returns True if challenge detected (caller must abort).
        """
        try:
            current_url = page.url.lower()

            # ── 1. URL-BASED DETECTION ──
            danger_urls = [
                '/challenge/', '/checkpoint/', '/suspended/',
                '/unusualactivity/', '/accounts/login/unusual_attempt/',
                '/accounts/suspended/', 'accounts/integrity/',
            ]
            url_flagged = any(d in current_url for d in danger_urls)

            # ── 2. PAGE CONTENT DETECTION ──
            page_flagged = False
            if not url_flagged:
                try:
                    body_text = await page.evaluate("() => document.body?.innerText || ''")
                    challenge_phrases = [
                        'verify your identity', 'confirm your identity',
                        'we detected an unusual', 'suspicious login',
                        'help us confirm it', 'enter your phone number',
                        'confirm this was you', 'we need to confirm',
                        'temporarily locked', 'account suspended',
                        'unusual login attempt', 'prove you\'re a human',
                        'complete the puzzle', 'select all images',
                        'enter the code we sent', 'add your email',
                        'confirm your email', 'verify your account',
                        'blocked', 'your account has been',
                    ]
                    body_lower = body_text.lower()
                    page_flagged = any(phrase in body_lower for phrase in challenge_phrases)
                except: pass

            # ── 3. ELEMENT-BASED DETECTION ──
            element_flagged = False
            if not url_flagged and not page_flagged:
                try:
                    challenge_selectors = [
                        'input[name="email"]',
                        'input[name="phone"]',
                        'button:has-text("Send Security Code")',
                        'button:has-text("Verify")',
                        'div:has-text("Verify your identity")',
                        'img[src*="challenge"]',
                        '[data-testid="challenge"]',
                    ]
                    for sel in challenge_selectors:
                        el = await page.query_selector(sel)
                        if el and await el.is_visible():
                            element_flagged = True
                            break
                except: pass

            if not (url_flagged or page_flagged or element_flagged):
                return False  # ✅ All clear

            # ── 🚨 CHALLENGE DETECTED — EMERGENCY PROTOCOL ──
            account_id   = account_data.get('id')
            account_user = account_data.get('username', 'unknown')

            logger.warning(f"🚨 CHALLENGE DETECTED for @{account_user} (URL: {page.url})")
            logger.warning(f"   📍 Trigger: URL={url_flagged} | Content={page_flagged} | Element={element_flagged}")
            logger.warning(f"   ❄️ Initiating Emergency Freeze Protocol (36h)...")

            # Freeze account for 36 hours
            if account_id:
                await db.execute("""
                    UPDATE instagram_warming_accounts
                    SET frozen_until = NOW() + INTERVAL '36 hours',
                        status = 'frozen',
                        updated_at = NOW()
                    WHERE id = $1
                """, account_id)
                await self.log_activity(
                    account_id, "challenge_freeze",
                    f"🚨 Instagram challenge detected! Emergency freeze for 36h. URL: {page.url[:80]}"
                )

            return True  # Caller must abort session

        except Exception as e:
            logger.error(f"⚠️ Challenge watchdog error: {e}")
            return False


    async def _perform_social_warmup(self, page, account_username, account_id: int = None):
        """
        🎭 30-DAY GHOST MATURATION WARMUP ROUTINE
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        Phase 1 (Days 1-7):   INCUBATION  — Scroll + Watch Reels only
        Phase 2 (Days 8-14):  SOCIALITE   — + Like posts (2-4 per session)
        Phase 3 (Days 15-21): OPERATIVE   — + Follow users (1-2 per session)
        Phase 4 (Days 22+):   MATURE      — Full routine, all actions
        """
        # Get session count to determine phase
        if account_id:
            row = await db.fetchrow("SELECT warming_session_count FROM instagram_warming_accounts WHERE id = $1", account_id)
            session_count = row['warming_session_count'] if row else 0
        else:
            session_count = 0

        # Determine phase
        if session_count < 7:
            phase = 1
            phase_name = "🛡️ Incubation (Scroll & Watch)"
            session_duration = random.randint(5, 10)
        elif session_count < 14:
            phase = 2
            phase_name = "🧪 Socialite (+ Liking Posts)"
            session_duration = random.randint(10, 15)
        elif session_count < 21:
            phase = 3
            phase_name = "⚔️ Operative (+ Following Users)"
            session_duration = random.randint(15, 22)
        else:
            phase = 4
            phase_name = "👑 Mature (Full Routine)"
            session_duration = random.randint(20, 30)

        await self._ghost_log(f"🎭 {account_username} — {phase_name} | Target: {session_duration} mins", page=page)
        if account_id:
            await self.log_activity(account_id, "session_start", f"🎭 {phase_name} — Target duration: {session_duration} mins")

        # ── POPUP & CHALLENGE WATCHDOG (all phases) ──
        async def clear_popups():
            # 1. 🚨 Security Challenge Check (The 36h Freeze)
            account_data = {'id': account_id, 'username': account_username}
            if await self._check_for_challenge(page, account_data):
                raise InstagramChallengeException(f"🚨 CHALLENGE DETECTED: Aborting session for @{account_username} and freezing for 36h.")

            # 2. Generic Popups (Not Now, Save Info, etc.)
            for btn_text in ["Not Now", "Not now", "Allow", "Save Info", "Turn On", "Dismiss"]:
                try:
                    btn = await page.query_selector(f'button:has-text("{btn_text}"), div[role="button"]:has-text("{btn_text}")')
                    if btn and await btn.is_visible():
                        await btn.click()
                        await asyncio.sleep(1.5)
                except InstagramChallengeException: raise
                except: pass

        # ── PHASE 1 & 2 & 3 & 4: SCROLL HOME FEED ──
        scroll_cycles = random.randint(6, 14)
        logger.info(f"📜 Scrolling home feed for {scroll_cycles} cycles...")

        for i in range(scroll_cycles):
            await self._check_human_intervention(page, account_username)
            await clear_popups()

            # Scroll
            swipe_dist = random.randint(300, 650)
            await self._human_swipe(page, swipe_dist, account_id)

            # Center nearest post
            try:
                await page.evaluate("""() => {
                    const articles = Array.from(document.querySelectorAll('article'));
                    const center = window.innerHeight / 2;
                    let closest = null, minDiff = Infinity;
                    articles.forEach(a => {
                        const rect = a.getBoundingClientRect();
                        const diff = Math.abs((rect.top + rect.height / 2) - center);
                        if (diff < minDiff) { minDiff = diff; closest = a; }
                    });
                    if (closest && minDiff < 400) closest.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }""")
                await asyncio.sleep(random.uniform(1.5, 3))
            except: pass

            # Reading pause (all phases)
            if random.random() < 0.20:
                stare = random.uniform(15, 40)
                logger.info(f"   📑 Reading a post for {int(stare)}s...")
                await self._smart_sleep(stare, page, account_username)
            else:
                await self._smart_sleep(random.uniform(5, 14), page, account_username)

            # Carousel swipe (all phases, 30% chance)
            if random.random() < 0.30:
                try:
                    next_btn = await page.query_selector('button[aria-label="Next"]')
                    if next_btn:
                        swipes = random.randint(1, 3)
                        logger.info(f"   📸 Carousel: swiping {swipes} images...")
                        for _ in range(swipes):
                            await self._human_click(page, 'button[aria-label="Next"]')
                            await asyncio.sleep(random.uniform(2, 5))
                except: pass

            # ── PHASE 2+: LIKE POSTS ──
            if phase >= 2 and random.random() < 0.35:
                try:
                    like_btn = await page.query_selector('article svg[aria-label="Like"]')
                    if like_btn:
                        await like_btn.click()
                        await self._ghost_log(f"❤️ Liked a post (Phase {phase})", page=page)
                        if account_id:
                            await self.log_activity(account_id, "like", "❤️ Liked a post on home feed")
                        await asyncio.sleep(random.uniform(1, 2.5))
                except: pass

        # ── ALL PHASES: WATCH REELS ──
        reel_count = random.randint(2, 4) if phase >= 2 else random.randint(1, 2)
        logger.info(f"🎬 Watching {reel_count} Reels...")
        if account_id:
            await self.log_activity(account_id, "reels_start", f"🎬 Entering Reels — watching {reel_count} clips")

        try:
            # Navigate to Reels tab
            reels_selectors = ['a[href="/reels/"]', 'svg[aria-label="Reels"]', 'svg[aria-label="Clips"]']
            found = False
            for sel in reels_selectors:
                try:
                    btn = await page.query_selector(sel)
                    if btn and await btn.is_visible():
                        await btn.click()
                        found = True
                        break
                except: continue

            if not found:
                await page.goto("https://www.instagram.com/reels/", wait_until="load")

            await page.wait_for_timeout(random.randint(5000, 8000))
            
            # 🛡️ VERIFY: Are we actually on Reels?
            if "/reels/" not in page.url:
                await self._ghost_log("⚠️ Reels unavailable or redirected. Skipping.", type="warn", page=page)
                await page.goto("https://www.instagram.com/", wait_until="load")
                return

            for reel_idx in range(reel_count):
                await self._check_human_intervention(page, account_username)
                watch_time = random.randint(12, 35)
                logger.info(f"   🎬 Watching Reel #{reel_idx+1} for {watch_time}s...")
                if account_id:
                    await self.log_activity(account_id, "video_watch", f"🎬 Watched Reel for {watch_time}s")
                await self._smart_sleep(watch_time, page, account_username)

                # Like reel (Phase 2+, 25% chance)
                if phase >= 2 and random.random() < 0.25:
                    try:
                        like_btn = await page.query_selector('svg[aria-label="Like"]')
                        if like_btn:
                            await like_btn.click()
                            logger.info("   ❤️ Liked a Reel")
                            if account_id:
                                await self.log_activity(account_id, "like", "❤️ Liked a Reel")
                            await self._smart_sleep(random.uniform(1, 2), page, account_username)
                    except: pass

                # Swipe to next reel
                await self._human_swipe(page, 500, account_id)
                await self._smart_sleep(random.uniform(1, 3), page, account_username)
                await clear_popups() 
        except InstagramChallengeException: raise
        except Exception as e:
            logger.warning(f"   ⚠️ Reels session issue: {e}")

        # ── ALL PHASES: WATCH STORIES ──
        try:
            await clear_popups()
            await page.goto("https://www.instagram.com/", wait_until="load")
            await page.wait_for_timeout(4000)
            await clear_popups()
            story_link = await page.query_selector('div[role="menuitem"] a, a[href*="/stories/"]')
            if story_link and await story_link.is_visible():
                await story_link.click()
                num_stories = random.randint(2, 5)
                logger.info(f"   📺 Watching {num_stories} stories...")
                if account_id:
                    await self.log_activity(account_id, "story_watch", f"📺 Viewed {num_stories} stories")
                for _ in range(num_stories):
                    await asyncio.sleep(random.uniform(6, 14))
                    await clear_popups()
                await page.keyboard.press("Escape")
                await asyncio.sleep(random.uniform(2, 4))
        except InstagramChallengeException: raise
        except: pass

        # ── PHASE 3+: FOLLOW 1-2 USERS (from Explore suggestions) ──
        if phase >= 3 and random.random() < 0.60:
            try:
                await clear_popups()
                await page.goto("https://www.instagram.com/explore/people/", wait_until="load")
                await page.wait_for_timeout(4000)
                await clear_popups()

                follow_btns = await page.query_selector_all('button:has-text("Follow")')
                follow_count = random.randint(1, 2)
                followed = 0
                for btn in follow_btns:
                    if followed >= follow_count:
                        break
                    try:
                        if await btn.is_visible():
                            await btn.click()
                            followed += 1
                            await self._ghost_log(f"👤 Followed a user (Phase {phase})", page=page)
                            if account_id:
                                await self.log_activity(account_id, "follow", "👤 Followed a suggested user from Explore")
                            await asyncio.sleep(random.uniform(8, 18))
                            await clear_popups()
                    except InstagramChallengeException: raise
                    except: pass
            except InstagramChallengeException: raise
            except Exception as e:
                logger.warning(f"   ⚠️ Follow step skipped: {e}")

        # ── PHASE 4: EXPLORE DEEP DIVE ──
        if phase >= 4 and random.random() < 0.40:
            try:
                await page.goto("https://www.instagram.com/explore/", wait_until="load")
                await page.wait_for_timeout(4000)
                logger.info("   🔍 Phase 4: Exploring the Explore grid...")
                if account_id:
                    await self.log_activity(account_id, "explore", "🔍 Browsed the Explore grid")
                for _ in range(random.randint(3, 5)):
                    await page.mouse.wheel(0, random.randint(300, 600))
                    await asyncio.sleep(random.uniform(4, 8))
            except: pass

        # ── RETURN HOME & EXIT ──
        try:
            await page.goto("https://www.instagram.com/", wait_until="load")
            await page.wait_for_timeout(2000)
        except: pass

        logger.info(f"✨ Warmup session complete for @{account_username} (Phase {phase})")
        if account_id:
            await self.log_activity(account_id, "session_end", f"✨ Session complete — Phase {phase} ({phase_name})")
        await self._human_session_exit(page)



    async def _human_session_exit(self, page):
        """Simulates a human finishing their browsing session before closing."""
        logger.info("🚪 Preparing natural exit routine...")
        # 1. Final Idle (Stare at page for a moment)
        await asyncio.sleep(random.uniform(4, 9))
        
        # 2. Move towards the top-right (like moving to the close-tab 'X')
        try:
            await self._human_mouse_move(page, random.randint(800, 1100), random.randint(0, 40))
        except: pass
        await asyncio.sleep(random.uniform(1, 3))

    async def _goto_instagram_home_and_login(self, page, account_data):
        """Shared helper: Go to Instagram home, login if needed, clear popups."""
        # 🚀 DEEP LINK BYPASS: Navigate to Inbox instead of Home to force session check
        nav_target = "https://www.instagram.com/direct/inbox/" if account_data.get('full_cookies_json') else "https://www.instagram.com/"
        await page.goto(nav_target, wait_until="load")
        
        # 🧪 GHOST CURSOR - Already handled by Browser Engine Init
        await page.wait_for_timeout(random.randint(4000, 7000))

        # 📱 MOBILE SPLASH SCREEN CHECK: Sometimes there's a "Log in" button before inputs show
        try:
            login_btn = await page.query_selector('button:has-text("Log in"), a:has-text("Log in"), button:has-text("Sign in"), span:has-text("Log in")')
            if login_btn and await login_btn.is_visible():
                logger.info("📱 Detected mobile splash screen. Clicking Log in...")
                await login_btn.click()
                await page.wait_for_timeout(random.randint(3000, 5000))
        except: pass

        # Check if login is needed
        user_input = await page.query_selector('input[name="email"], input[name="username"], input[aria-label*="username"]')
        if user_input:
            user_val = account_data.get('username')
            pass_val = account_data.get('password')
            
            if not user_val or not pass_val:
                await self._ghost_log("❌ Error: Missing credentials for this account!", type="error", page=page)
                raise Exception(f"Missing credentials for account {account_data.get('id')}")

            pass_show = pass_val[:2] + "*" * (len(pass_val)-2) if len(pass_val) > 2 else "***"
            await self._ghost_log(f"🔑 Login: @{user_val} (Pass: {pass_show})", page=page)
            await user_input.click()
            await page.keyboard.press("Control+A") # Clear existing
            await page.keyboard.press("Backspace")
            await self._human_type(page, user_val)
            await asyncio.sleep(random.uniform(1, 2))
            
            pass_input = await page.query_selector('input[name="pass"], input[name="password"], input[aria-label*="password"]')
            if pass_input:
                await pass_input.click()
                await self._human_type(page, pass_val)
                await asyncio.sleep(1)
                
                # Try Enter first
                await page.keyboard.press("Enter")
                
                # 🖱️ EXPLICIT CLICK (Mobile Fallback): If Enter didn't work, smash the Log In button!
                try:
                    submit_btn = await page.query_selector('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Confirm"), div[role="button"]:has-text("Log in")')
                    if submit_btn and await submit_btn.is_visible():
                        logger.info("🖱️ Clicking explicit Log In/Confirm button...")
                        await submit_btn.click()
                except: pass
                
                await page.wait_for_timeout(10000)

            # ✅ CHECK: Did login FAIL? (password error message visible)
            wrong_pass = await page.query_selector('div:has-text("Sorry, your password was incorrect"), div:has-text("The password you entered is incorrect"), #slfErrorAlert, div[data-testid="login-error-message"]')
            if wrong_pass:
                err_text = await wrong_pass.inner_text()
                logger.error(f"❌ Login FAILED for @{account_data['username']}: {err_text.strip()}")
                # Mark account as error in DB so it's skipped next time
                await db.execute(
                    "UPDATE instagram_warming_accounts SET status = 'error', updated_at = NOW() WHERE username = $1",
                    account_data['username']
                )
                raise Exception(f"Login failed for @{account_data['username']}: Wrong credentials")

            # 🛡️ Handle 2FA (Multi-Variant Specialist)
            logger.info("🛡️ Scanning for 2FA Security Checkpoint (Multi-Variant)...")
            await page.wait_for_timeout(5000)
            
            # Variant A: Unified "Code" box (Common in SS)
            two_fa = await page.query_selector('input[name="verificationCode"], input[aria-label="Security Code"], input[placeholder="Code"], input[aria-label="Code"], input[aria-label*="digit"]')
            
            # Variant B: Split 6-digit boxes (Instagram's "Modern" split view)
            split_boxes = await page.query_selector_all('input[autocomplete="one-time-code"], input[id*="verificationCode"]')
            
            fa_secret = account_data.get('fa_secret') or account_data.get('verification_code')
            
            if (two_fa or split_boxes) and fa_secret:
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
                                if char:
                                    await page.keyboard.type(char, delay=random.randint(100, 250))
                        elif split_boxes:
                            logger.info("   🧩 Detected split-box 2FA. Filling digits...")
                            for i, char in enumerate(code):
                                if i < len(split_boxes):
                                    await split_boxes[i].click()
                                    await split_boxes[i].type(char, delay=100)
                        
                        await page.keyboard.press("Enter")
                        await asyncio.sleep(2)
                        
                        # 🖱️ DYNAMIC 2FA CONFIRM: Match any possible confirm button
                        confirm_selectors = [
                            'button:has-text("Continue")', 'button:has-text("Confirm")', 
                            'button:has-text("Trust")', 'button:has-text("Verify")',
                            'button:has-text("Submit")', 'div[role="button"]:has-text("Continue")',
                            'div[role="button"]:has-text("Confirm")', 'button[type="submit"]'
                        ]
                        for selector in confirm_selectors:
                            try:
                                btn = await page.query_selector(selector)
                                if btn and await btn.is_visible():
                                    logger.info(f"   🔘 Clicking Confirm variant: {selector}")
                                    await btn.click()
                                    break
                            except: pass
                        
                        await page.wait_for_timeout(10000)
                except Exception as e:
                    logger.error(f"⚠️ 2FA Code generation failed: {e}")
            else:
                logger.info("✨ No recognized 2FA layout found or no secret provided.")

        # 🛑 THE BLANK SCREEN BARRIER: Wait for the app to actually load
        try:
            logger.info("⏳ Waiting for feed to render...")
            await page.wait_for_selector('main', timeout=45000)
            await page.wait_for_timeout(random.randint(3000, 5000))
        except:
            logger.warning("⚠️ Feed took too long. Attempting recovery...")
            await page.wait_for_timeout(5000)

            # 🏠 STAY ON HOME FEED: Refresh to get new content!
            logger.info("🏠 Refreshing home feed to get new content...")
            try:
                # Pull down gesture (Human-style refresh)
                await page.mouse.move(200, 200)
                await page.mouse.down()
                await page.mouse.move(200, 500, steps=20)
                await page.mouse.up()
                await page.wait_for_timeout(random.randint(5000, 8000))
            except: pass
            
            logger.info("✅ Home feed is live and fresh! Ghost session starting...")

        # 🧹 HUMAN POPUP CLEARANCE: Not Now / Save Info / Notifications
        logger.info("🧹 Ghost Unit is clearing system popups...")
        for btn_text in ["Not Now", "Not now", "Allow", "Save Info", "Save info", "Turn On"]:
            try:
                selector = f'button:has-text("{btn_text}")'
                btn = await page.query_selector(selector)
                if btn and await btn.is_visible():
                    logger.info(f"   🔘 Clicking human-style: {btn_text}")
                    await self._human_click(page, selector)
                    await page.wait_for_timeout(random.randint(2000, 4000))
            except: pass

        if await self._check_for_challenge(page, account_data):
            raise Exception(f"🚨 CHALLENGE DETECTED: Aborting login for @{account_data['username']} and freezing for 36h.")

        await self._ghost_log(f"✅ Login Sequence Complete for @{account_data['username']}", page=page)
        
        # 🛸 ESCAPE TRAP: Instagram sometimes sticks accounts on a "Suggested for you" page
        await self._clear_suggestions_trap(page)

    async def _clear_suggestions_trap(self, page):
        """Detects if we are stuck on the 'Suggested for you' / 'Find People' page and escapes it."""
        try:
            url = page.url
            # Detect '?deoia=1' or '/explore/people/' or empty feed triggers
            if "?deoia=1" in url or "/explore/people/" in url or await page.query_selector('h2:has-text("Suggested for you")'):
                await self._ghost_log("🪤 Trapped in Suggestions. Escaping to Feed...", page=page)
                # Try clicking the Instagram logo first
                logo = await page.query_selector('svg[aria-label="Instagram"]')
                if logo:
                    await logo.click()
                    await page.wait_for_timeout(3000)
                
                # If still stuck, force home
                if "?deoia=1" in page.url or "/explore/people/" in page.url:
                    await page.goto("https://www.instagram.com/", wait_until="load")
                    await page.wait_for_timeout(4000)
        except: pass

    async def _ghost_search_and_navigate(self, page, username):
        """Shared helper: Use the search bar to navigate to a profile (Ghost-Human Mobile-Aware)."""
        logger.info(f"🔎 Searching for @{username}...")
        
        # 1. Try Mobile Search Icon first
        search_icon = await page.query_selector('a[href="/explore/"], svg[aria-label="Search"]')
        if search_icon:
            await search_icon.click()
            await page.wait_for_timeout(random.randint(2000, 3000))

            # Mobile Search Input is often different
            search_input = await page.query_selector('input[placeholder="Search"], input[aria-label="Search input"]')
            if search_input:
                await search_input.type(username, delay=random.randint(150, 280))
                await page.wait_for_timeout(5000)
                
                # Click the first result
                result = await page.query_selector(f'a[href="/{username}/"]')
                if result:
                    await result.click()
                else:
                    await page.keyboard.press("Enter")
        else:
            # Fallback for Direct Navigation
            await page.goto(f"https://www.instagram.com/{username}/", wait_until="networkidle")

    async def _browser_action_analyze(self, page, account_data):
        """Logic that runs INSIDE the real Chrome browser (Verified Ghost-Human Flow)."""
        username = account_data['target_username']
        session_count = account_data.get('warming_session_count', 0)
        limit = await self._get_dynamic_daily_limit(session_count)
        usage = account_data.get('daily_usage_count', 0)

        # 1. Login if needed
        await self._goto_instagram_home_and_login(page, account_data)

        # 📌 REGISTER ACTIVE PAGE for Smart Pause/Resume & Auto-Cleanup
        self.active_pages[account_data['username']] = page
        
        # 🧟‍♂️ ZOMBIE PROTECTION: Clear status if browser is closed externally
        def on_close(p):
            self.active_pages.pop(account_data['username'], None)
            logger.info(f"🛑 Browser tab for @{account_data['username']} closed. Status cleared.")
        page.on("close", on_close)

        # 2. ALWAYS Social Warmup first
        try:
            await self._perform_social_warmup(page, account_data['username'], account_data['id'])
            
            # ✅ UPDATE: Mark seasoning day as successful
            await db.execute("UPDATE instagram_warming_accounts SET warming_session_count = warming_session_count + 1, updated_at = NOW() WHERE id = $1", account_data['id'])

            # 3. CHECK GUARD: Is it allowed to scrape yet?
            # Maturation Trigger: Needs > 7 sessions. 
            # Limit check: If we've already hit the daily limit for scraping, we skip.
            if session_count < 7:
                logger.info(f"🛡️ MATURATION GUARD: @{account_data['username']} is seasoning (#{session_count + 1}/7). Skipping scrape for now.")
                return None # Graceful skip
            
            if usage >= limit and limit > 0:
                logger.info(f"🛡️ LIMIT GUARD: @{account_data['username']} hit daily limit ({usage}/{limit}). Skipping scrape.")
                return None
        except Exception as e:
            logger.error(f"⚠️ Social Warmup interrupted: {e}")
            self.active_pages.pop(account_data['username'], None)
            raise

            
        # 4. Search for target via Ghost Search
        await self._ghost_search_and_navigate(page, username)


        # 4. Human-Like Behavior: Scroll the profile page
        logger.info(f"🖱️ Scrolling @{username} profile page like a human...")
        for _ in range(random.randint(3, 5)):
            await page.mouse.wheel(0, random.randint(300, 700))
            await page.mouse.move(random.randint(200, 900), random.randint(200, 600))
            await asyncio.sleep(random.uniform(2, 5))

        # 5. Extract Bio & Stats cleanly
        try:
            profile_data = await page.evaluate("""() => {
                const header = document.querySelector('header section') || document.body;
                let bioText = "";
                const bioDivs = document.querySelectorAll('header section > div');
                if (bioDivs.length > 2) {
                    bioText = bioDivs[bioDivs.length - 1].innerText;
                } else {
                    bioText = header.innerText;
                }
                
                const img = document.querySelector('header img');
                return {
                    full_text: header.innerText,
                    bio: bioText,
                    pic_url: img ? img.src : ""
                };
            }""")
        except:
            profile_data = {"full_text": "", "bio": "", "pic_url": ""}
        
        # 🧹 Cleanup
        self.active_pages.pop(account_data['username'], None)

        import re
        full_text = profile_data.get('full_text', '')
        
        posts = 0
        followers = 0
        following = 0
        
        m_posts = re.search(r'([\d,]+)\s*post', full_text, re.IGNORECASE)
        if m_posts: posts = int(m_posts.group(1).replace(',', ''))
        
        m_fol = re.search(r'([\d,]+)\s*follower', full_text, re.IGNORECASE)
        if m_fol: followers = int(m_fol.group(1).replace(',', ''))
        
        m_fvg = re.search(r'([\d,]+)\s*following', full_text, re.IGNORECASE)
        if m_fvg: following = int(m_fvg.group(1).replace(',', ''))

        bio = profile_data.get('bio', '')
        # Clean bio text (remove stats if they leaked in)
        bio = re.sub(r'[\d,]+\s*(posts?|followers?|following)', '', bio, flags=re.IGNORECASE)
        bio = bio.replace(username, '')
        bio = "\n".join([line.strip() for line in bio.split('\n') if line.strip()]).strip()
        
        profile_pic_url = profile_data.get('pic_url', '')

        logger.info(f"✅ Analyzed @{username}: {followers} followers | {posts} posts")
        return {
            "bio": bio,
            "posts": posts,
            "followers": followers,
            "following": following,
            "full_name": username,
            "is_private": False,
            "profile_pic_url": profile_pic_url
        }

    async def analyze_lead(self, user_id: int, lead_id: int):
        lead = await db.fetchrow("SELECT instagram_username FROM instagram_warming_leads WHERE id = $1 AND user_id = $2", lead_id, user_id)
        if not lead: return {"error": "Lead not found"}
        username = lead['instagram_username']

        # Pick one account (sequential processing)
        account = await self._get_available_ghost(user_id)
        if not account: return {"error": "No available accounts"}
        
        # Add target info to account data
        account_data = dict(account)
        account_data['target_username'] = username
        
        try:
            # 🚀 RUN BROWSER SESSION
            result = await browser_engine.run_warming_session(account_data, self._browser_action_analyze)
            
            # 🏁 ALWAYS INC SAFETY COUNTER (Treat warmup as a usage session)
            await db.execute("UPDATE instagram_warming_accounts SET daily_usage_count = daily_usage_count + 1, updated_at = NOW() WHERE id = $1", account['id'])

            # IF GUARD SKIPPED (Seasoning Mode - No Scraping)
            if not result:
                logger.info(f"🛡️ Seasoning session success for @{account_data['username']}. Lead @{username} preserved in pool.")
                return {"success": True, "note": "Warming only (Seasoning Phase)"}

            # 🚀 QUALIFY & UPDATE
            await self._qualify_and_update(lead_id, user_id, 
                                         result['bio'], 
                                         result['followers'], 
                                         result['following'], 
                                         result['full_name'], 
                                         [{"posts_count": result.get('posts', 0)}], # Pass posts in the recent_posts array
                                         profile_pic_url=result.get('profile_pic_url', ""),
                                         is_private=result['is_private'])
            
            return {"success": True}
        except Exception as e:
            logger.error(f"❌ Browser Analyze failed: {e}")
            return {"error": str(e)}

    async def _browser_action_warmup_only(self, page, account_data):
        """Dedicated Ghost-Human routine with NO target lead (Pure Seasoning)."""
        # 1. Login
        await self._goto_instagram_home_and_login(page, account_data)
        
        # 📌 REGISTER ACTIVE PAGE for Smart Pause/Resume
        self.active_pages[account_data['username']] = page
        
        # 2. Perform phased social warmup routine
        await self._perform_social_warmup(page, account_data['username'], account_data['id'])
        
        # 3. ✅ LOCK FOR 24H: Increment session count AND usage count so it's locked
        await db.execute("""
            UPDATE instagram_warming_accounts 
            SET warming_session_count = warming_session_count + 1,
                daily_usage_count = 1,
                last_usage_reset = NOW(),
                updated_at = NOW() 
            WHERE id = $1
        """, account_data['id'])
        
        logger.info(f"🔒 @{account_data['username']} locked for 24h. Session complete.")
        
        # 🧹 Cleanup
        self.active_pages.pop(account_data['username'], None)
        return {"success": True}

    async def manual_warmup_account(self, user_id: int, account_id: int):
        """Triggers a browser session for a single account just to do social activity."""
        account = await db.fetchrow("SELECT * FROM instagram_warming_accounts WHERE id = $1 AND user_id = $2", account_id, user_id)
        if not account: return {"error": "Account not found"}
        
        # 🔒 24H LOCK CHECK: Don't run if already done today
        if (account['daily_usage_count'] or 0) >= 1:
            from datetime import datetime, timezone, timedelta
            reset_at = account['last_usage_reset']
            if reset_at:
                unlock_at = reset_at.replace(tzinfo=timezone.utc) + timedelta(hours=24)
                remaining = unlock_at - datetime.now(timezone.utc)
                h = int(remaining.total_seconds() // 3600)
                m = int((remaining.total_seconds() % 3600) // 60)
                if remaining.total_seconds() > 0:
                    return {"error": f"🔒 Account @{account['username']} already warmed today. Unlocks in {h}h {m}m."}
        
        account_data = dict(account)
        # Fetch proxy if exists
        proxy = await db.fetchrow("SELECT * FROM instagram_warming_proxies WHERE id = $1", account['proxy_id'])
        if proxy:
            account_data['proxy_host'] = proxy['host']
            account_data['proxy_port'] = proxy['port']
            account_data['proxy_user'] = proxy['username']
            account_data['proxy_pass'] = proxy['password']
            account_data['proxy_type'] = proxy['proxy_type']

        try:
            logger.info(f"🔥 Manual Warm-up triggered for @{account_data['username']}...")
            await browser_engine.run_warming_session(account_data, self._browser_action_warmup_only)
            return {"success": True}
        except Exception as e:
            logger.error(f"❌ Manual Warm-up failed: {e}")
            return {"error": str(e)}

    async def _qualify_and_update(self, lead_id: int, user_id: int, bio: str, followers: int, following: int, full_name: str, recent_posts: List[dict], profile_pic_url: str = "", is_private: bool = False):
        settings = await self.get_settings(user_id)
        is_qualified = True
        
        if settings['min_followers'] > 0 and followers < settings['min_followers']: is_qualified = False
        if is_qualified and settings['max_followers'] > 0 and followers > settings['max_followers']: is_qualified = False
        if is_qualified and settings['bio_keywords']:
            kw_list = [k.strip().lower() for k in settings['bio_keywords'].split(',') if k.strip()]
            if kw_list and not any(kw in bio.lower() for kw in kw_list):
                is_qualified = False

        new_status = 'qualified' if is_qualified else 'rejected'
        if is_private: new_status = 'private'
        posts_json = json.dumps(recent_posts or [])
        
        await db.execute("""
            UPDATE instagram_warming_leads 
            SET status = $1, bio = $2, follower_count = $3, following_count = $4, full_name = $5, recent_posts = $6, profile_pic_url = $7, is_private = $8, updated_at = NOW() 
            WHERE id = $9
        """, new_status, bio, followers, following, full_name, posts_json, profile_pic_url, is_private, lead_id)
        
        # 🛰️ INSTANT UI FLASH
        try:
            await manager.send_personal_message({
                "type": "instagram_lead_updated",
                "lead_id": lead_id,
                "status": new_status
            }, user_id)
        except: pass
        
        return new_status

    async def _browser_action_harvest(self, page, account_data):
        """Logic to scrape followers from a profile (Verified Ghost-Human Flow)."""
        username = account_data['target_username']
        session_count = account_data.get('warming_session_count', 0)
        limit = await self._get_dynamic_daily_limit(session_count)
        usage = account_data.get('daily_usage_count', 0)

        # 1. Login if needed
        await self._goto_instagram_home_and_login(page, account_data)

        # 📌 REGISTER ACTIVE PAGE for Smart Pause/Resume & Auto-Cleanup
        self.active_pages[account_data['username']] = page
        
        # 🧟‍♂️ ZOMBIE PROTECTION: Clear status if browser is closed externally
        def on_close(p):
            self.active_pages.pop(account_data['username'], None)
            logger.info(f"🛑 Browser tab for @{account_data['username']} closed. Status cleared.")
        page.on("close", on_close)

        # 2. ALWAYS Social Warmup first
        try:
            await self._perform_social_warmup(page, account_data['username'], account_data['id'])

            # ✅ UPDATE: Mark seasoning day as successful
            await db.execute("UPDATE instagram_warming_accounts SET warming_session_count = warming_session_count + 1, updated_at = NOW() WHERE id = $1", account_data['id'])

            # 3. CHECK GUARD: Is it allowed to scrape yet?
            if session_count < 7:
                logger.info(f"🛡️ MATURATION GUARD: @{account_data['username']} is seasoning (#{session_count + 1}/7). Skipping harvest for @{username}")
                return [] # Graceful skip
            
            if usage >= limit and limit > 0:
                logger.info(f"🛡️ LIMIT GUARD: @{account_data['username']} hit daily limit ({usage}/{limit}). Skipping harvest.")
                return []
        except Exception as e:
            logger.error(f"⚠️ Social Warmup interrupted during harvest: {e}")
            self.active_pages.pop(account_data['username'], None)
            raise


        # 4. Ghost Search to profile
        await self._ghost_search_and_navigate(page, username)


        # 3. Click Followers link
        logger.info(f"\U0001f300 Opening followers list for @{username}...")
        followers_btn = await page.query_selector('a:has-text("followers")')
        if not followers_btn:
            logger.warning(f"\u26a0\ufe0f Could not find followers button for @{username}")
            return []

        await followers_btn.click()
        await page.wait_for_timeout(5000)

        # 4. Harvest with Real Mouse Wheel Scroll (Verified in Pilot)
        logger.info("\U0001f5b1\ufe0f Harvesting followers with real mouse wheel scroll...")
        usernames = set()

        for i in range(15):
            names = await page.evaluate("""() => {
                const links = Array.from(document.querySelectorAll('div[role=\"dialog\"] a[role=\"link\"]'));
                return links.map(l => l.innerText).filter(t => t && !t.includes('\\n') && t.length > 2);
            }""")
            for n in names:
                if n not in [account_data['username'], username, 'Follow', 'Following']:
                    usernames.add(n)

            logger.info(f"   \U0001f4c8 Harvested so far: {len(usernames)} users...")
            if len(usernames) >= 100:
                break

            await page.mouse.move(640, 400)
            await page.mouse.wheel(0, random.randint(600, 900))
            await asyncio.sleep(random.uniform(2, 4))

        logger.info(f"\u2705 Harvest complete: {len(usernames)} leads from @{username}")
        return list(usernames)

    async def harvest_lead_network(self, user_id: int, lead_id: int):
        """🚀 PHASE 2: Deep Scrape via Browser"""
        lead = await db.fetchrow("SELECT instagram_username FROM instagram_warming_leads WHERE id = $1 AND user_id = $2", lead_id, user_id)
        if not lead: return
        username = lead['instagram_username']
        
        account = await self._get_available_ghost(user_id)
        if not account: return
        
        account_data = dict(account)
        account_data['target_username'] = username

        try:
            # 🚀 RUN BROWSER HARVEST
            usernames = await browser_engine.run_warming_session(account_data, self._browser_action_harvest)
            
            # IF GUARD SKIPPED
            if not usernames and usernames != []: # Check if it returned a skipped state (None)
                logger.info(f"🛡️ Seasoning session success for @{account_data['username']}. Network Harvest for @{username} preserved for later.")
                return 

            if usernames is None: # Explicit safety
                return
            
            count = 0
            for u_clean in usernames:
                status = await db.execute("""
                    INSERT INTO instagram_warming_leads (user_id, instagram_username, discovery_keyword, source, status) 
                    VALUES ($1, $2, $3, 'network_expansion', 'discovered') ON CONFLICT DO NOTHING
                """, user_id, u_clean, f"follower_of_{username}")
                if status == "INSERT 0 1": count += 1
            
            await db.execute("UPDATE instagram_warming_leads SET status = 'harvested', updated_at = NOW() WHERE id = $1", lead_id)
            await db.execute("UPDATE instagram_warming_accounts SET daily_usage_count = daily_usage_count + 1, updated_at = NOW() WHERE id = $1", account['id'])
            logger.info(f"✅ Browser Harvest Complete: +{count} leads from @{username}")
            
            try:
                await manager.send_personal_message({"type": "instagram_lead_updated", "lead_id": lead_id, "status": "harvested"}, user_id)
            except: pass
        except Exception as e:
            logger.error(f"❌ Browser Harvest Failed: {e}")

    async def _get_insta_client(self, account_row):
        username = account_row['username']
        if username in self._insta_clients:
            return self._insta_clients[username]
        
        from instagrapi import Client
        import pyotp
        cl = Client()
        cl.set_device({
            "app_version": "385.0.0.47.74",
            "manufacturer": "Instagram",
            "model": "Web",
            "device": "Web",
        })
        def abort_handler(*args, **kwargs):
            raise Exception("Challenge or interactive prompt triggered. Aborting to prevent hanging.")
            
        cl.challenge_code_handler = abort_handler
        cl.change_password_handler = abort_handler
        
        if account_row.get('host'):
            p_auth = f"{account_row['p_user']}:{account_row['p_pass']}@" if account_row.get('p_user') else ""
            p_url = f"{account_row['proxy_type']}://{p_auth}{account_row['host']}:{account_row['port']}"
            cl.set_proxy(p_url)
            
        try:
            v_code_raw = account_row.get('verification_code')
            v_code = None
            if v_code_raw:
                if len(v_code_raw) > 10:
                    # It's a TOTP Secret! Generate the code on the fly
                    try:
                        totp = pyotp.TOTP(v_code_raw.replace(" ", ""))
                        v_code = totp.now()
                        logger.info(f"🔑 Autonomous 2FA: Generated fresh code {v_code} for @{username}")
                    except:
                        v_code = v_code_raw # Fallback if not a valid secret
                else:
                    v_code = v_code_raw

            # 💉 HYPER-PERSISTENCE: Try loading full browser state from dump
            if account_row.get('settings_dump'):
                try:
                    cl.set_settings(account_row['settings_dump'] if isinstance(account_row['settings_dump'], dict) else json.loads(account_row['settings_dump']))
                    cl.login_by_sessionid(account_row['session_id']) # Double verify
                    logger.info(f"⚡ Memory Recall: State restored for @{username} (No re-login needed)")
                except:
                    logger.warning(f"⚠️ State dump for @{username} stale, falling back to handshake.")
                    if account_row.get('session_id'):
                        cl.login_by_sessionid(account_row['session_id'])
                    else:
                        cl.login(username, account_row['password'], verification_code=v_code)
            elif account_row.get('session_id'):
                try:
                    cl.login_by_sessionid(account_row['session_id'])
                    logger.info(f"✨ Session Handshake successful for @{username}")
                except Exception as sess_err:
                    if "429" in str(sess_err):
                        raise Exception("Proxy IP Rate Limited (429). Fleet needs to rest.")
                    logger.warning(f"⚠️ Session rejected for @{username}, attempting password re-auth. Reason: {sess_err}")
                    cl.login(username, account_row['password'], verification_code=v_code)
            else:
                cl.login(username, account_row['password'], verification_code=v_code)
            
            # --- MISSION SUCCESS: SAVE STATE FOR FUTURE ---
            new_dump = cl.get_settings()
            await db.execute("UPDATE instagram_warming_accounts SET settings_dump = $1, updated_at = NOW() WHERE id = $2", json.dumps(new_dump), account_row['id'])
            
            self._insta_clients[username] = cl
            return cl
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "Challenge" in err_str or "FeedbackRequired" in err_str:
                logger.error(f"🛑 CRITICAL: Ghost @{username} Triggered Risk Alert ({err_str}). FREEZING for 36h!")
                await db.execute("""
                    UPDATE instagram_warming_accounts 
                    SET status = 'error', frozen_until = NOW() + INTERVAL '36 hours', updated_at = NOW() 
                    WHERE id = $1
                """, account_row['id'])
            else:
                logger.error(f"❌ IG Warmer Deep Handshake failed for @{username}: {e}")
                await db.execute("UPDATE instagram_warming_accounts SET status = 'error', updated_at = NOW() WHERE id = $1", account_row['id'])
            return None

    # --- Campaign / Outreach (Simplified) ---
    async def update_lead_status(self, user_id: int, lead_id: int, status: str):
        await db.execute("UPDATE instagram_warming_leads SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3", status, lead_id, user_id)
        return {"status": "success"}

    async def delete_lead(self, user_id: int, lead_id: int):
        await db.execute("DELETE FROM instagram_warming_leads WHERE id = $1 AND user_id = $2", lead_id, user_id)
        return {"status": "success"}

    async def clear_leads(self, user_id: int):
        await db.execute("DELETE FROM instagram_warming_leads WHERE user_id = $1", user_id)
        return {"status": "success"}

    async def bulk_add_proxies(self, user_id: int, lines: List[str]):
        count = 0
        for line in lines:
            line = line.strip()
            if not line: continue
            
            # Smart Parser: Detect common formats (host:port:user:pw or user:pw:host:port)
            parts = line.split(':')
            if len(parts) < 2: continue
            
            host, port, user, pw = "", 0, "", ""
            
            # Format A: host:port:user:pw (Standard)
            try:
                if parts[1].isdigit():
                    host, port = parts[0], int(parts[1])
                    user = parts[2] if len(parts) > 2 else ""
                    pw = parts[3] if len(parts) > 3 else ""
                # Format B: user:pw:host:port
                elif len(parts) >= 4 and parts[3].isdigit():
                    user, pw, host, port = parts[0], parts[1], parts[2], int(parts[3])
                else:
                    # Fallback: Just skip if we can't find a port
                    logger.warning(f"⚠️ Skipping invalid proxy line (No port found): {line}")
                    continue
            except: continue

            if host and port:
                await db.execute("""
                    INSERT INTO instagram_warming_proxies (user_id, host, port, username, password, proxy_type) 
                    VALUES ($1, $2, $3, $4, $5, 'http')
                """, user_id, host, port, user, pw)
                count += 1
        return count

    async def bulk_add_accounts(self, user_id: int, lines: List[str]):
        proxies = await self.get_proxies(user_id)
        active_pos = 0
        count = 0
        for line in lines:
            line = line.strip()
            if not line: continue
            
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
                cookie_json_match = re.search(r'Cookies[:：]\s*(\[.*?\])', line)
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
                        elif p_idx == 0 and p.isalnum() and len(p) >= 16:
                            fa_secret = p
                        elif 'x-mid=' in p or 'ig-u-rur=' in p:
                            match = re.search(r'sessionid=([^;|\s]+)', p)
                            if match: session_id = match.group(1)

            if not username or not password: continue
            
            # Rotate Proxy (Round Robin)
            proxy_id = None
            if proxies:
                proxy_id = proxies[active_pos % len(proxies)]['id']
            
            await db.execute("""
                INSERT INTO instagram_warming_accounts (user_id, username, password, proxy_id, session_id, ds_user_id, full_cookies_json, verification_code, status, warming_session_count)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', 0)
                ON CONFLICT (username) DO UPDATE SET
                    password = EXCLUDED.password,
                    proxy_id = EXCLUDED.proxy_id,
                    session_id = EXCLUDED.session_id,
                    ds_user_id = EXCLUDED.ds_user_id,
                    full_cookies_json = EXCLUDED.full_cookies_json,
                    verification_code = EXCLUDED.verification_code,
                    status = 'active',
                    created_at = NOW(),
                    warming_session_count = 0,
                    updated_at = NOW()
            """, user_id, username, password, proxy_id, session_id, ds_user_id, full_cookies_json, fa_secret)  # fa_secret saved as verification_code
            count += 1
            active_pos += 1
            
        # 🚨 Emergency Wake-Up Override
        self.nap_end_times[user_id] = 0
        return count

instagram_warming_service = InstagramWarmingService()
