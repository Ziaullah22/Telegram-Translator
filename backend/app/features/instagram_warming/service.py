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

# 🚨 SMART TELEMETRY
logging.basicConfig(level=logging.INFO, format='%(levelname)s:     %(message)s')
logger = logging.getLogger(__name__)

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
        return [dict(row) for row in rows]

    async def add_account(self, user_id: int, account_data):
        await db.execute("""
            INSERT INTO instagram_warming_accounts (user_id, username, password, proxy_id, status)
            VALUES ($1, $2, $3, $4, 'active')
            ON CONFLICT (username) DO UPDATE SET
                password = EXCLUDED.password,
                proxy_id = EXCLUDED.proxy_id,
                status = 'active',
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
    async def _auto_pilot_worker(self, user_id: int):
        logger.info(f"🛸 Warming Auto-Pilot Sector Active for User {user_id}")
        try:
            while self.workers.get(user_id):
                # 1. Obey Pre-existing Global Nap
                while self.nap_end_times.get(user_id, 0) > time.time() and self.workers.get(user_id):
                    remaining_raw = self.nap_end_times[user_id] - time.time()
                    try:
                        await manager.send_personal_message({
                            "type": "warming_autopilot_resting",
                            "duration": int(remaining_raw),
                            "total": 180 
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
                    logger.error(f"⚠️ Hibernation Check Failed: {e}. Defaulting to 5-min safety nap.")
                    self.nap_end_times[user_id] = time.time() + 300
                    continue

                # 2. Priority Mission: Analyze new leads
                lead = await db.fetchrow("""
                    SELECT id FROM instagram_warming_leads 
                    WHERE user_id = $1 AND status = 'discovered' 
                    ORDER BY created_at ASC LIMIT 1
                """, user_id)
                
                mission_type = None
                
                if lead:
                    logger.info(f"🎯 Auto-Pilot: Initiating Analysis on Lead {lead['id']}...")
                    await self.analyze_lead(user_id, lead['id'])
                    mission_type = 'analyze'
                else:
                    # 3. Secondary Mission: Harvest existing qualified leads
                    lead = await db.fetchrow("""
                        SELECT id FROM instagram_warming_leads 
                        WHERE user_id = $1 AND status = 'qualified' 
                        ORDER BY updated_at ASC LIMIT 1
                    """, user_id)
                    
                    if lead:
                        logger.info(f"🛰️ Auto-Pilot: Initiating Deep Harvest on Lead {lead['id']}...")
                        await self.harvest_lead_network(user_id, lead['id'])
                        mission_type = 'harvest'
                
                if not mission_type:
                    logger.info(f"😴 Warming Fleet Resting: No leads discovered or qualified for user {user_id}.")
                    # Only send idle if we aren't currently napping from a previous instruction
                    if self.nap_end_times.get(user_id, 0) < time.time():
                        await manager.send_personal_message({"type": "warming_autopilot_idle", "message": "Fleet Idle: Awaiting new leads..."}, user_id)
                    await asyncio.sleep(60)
                    continue

                # 🛌 THE GLOBAL NAP: Random cooldown between 2-3 minutes after every action
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
        
        # 2. Check if ANY account is available right now
        available = await db.fetchval("""
            SELECT COUNT(id) FROM instagram_warming_accounts 
            WHERE user_id = $1 
              AND status IN ('active', 'error') 
              AND daily_usage_count < 5
              AND (frozen_until IS NULL OR frozen_until < NOW())
        """, user_id)
        
        if available > 0:
            return None # Ghosts are ready for duty
            
        # 3. Fleet Exhausted! Find the SOONEST time any ghost recovers.
        # Use COALESCE(..., 'infinity') to ensure NULL fields don't kill the LEAST function.
        soonest = await db.fetchval("""
            SELECT MIN(
                LEAST(
                   CASE WHEN daily_usage_count >= 5 THEN COALESCE(last_usage_reset, created_at, NOW()) + INTERVAL '24 hours' ELSE 'infinity'::timestamp END,
                   CASE WHEN frozen_until IS NOT NULL AND frozen_until > NOW() THEN frozen_until ELSE 'infinity'::timestamp END
                )
            )
            FROM instagram_warming_accounts 
            WHERE user_id = $1 AND status IN ('active', 'error')
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

        # 2. Find a ghost that is active, NOT hit limit, and NOT frozen
        account = await db.fetchrow(f"""
            SELECT a.*, p.host, p.port, p.username as p_user, p.password as p_pass, p.proxy_type 
            FROM instagram_warming_accounts a LEFT JOIN instagram_warming_proxies p ON a.proxy_id = p.id
            WHERE a.user_id = $1 
              AND a.status IN ('active', 'error') 
              AND a.daily_usage_count < 5
              AND (a.frozen_until IS NULL OR a.frozen_until < NOW())
            {"AND a.id NOT IN (" + ",".join(map(str, used_ids)) + ")" if used_ids else ""}
            ORDER BY CASE WHEN a.status = 'active' THEN 0 ELSE 1 END ASC, updated_at ASC NULLS FIRST LIMIT 1
        """, user_id)
        
        return account

    async def analyze_lead(self, user_id: int, lead_id: int):
        lead = await db.fetchrow("SELECT instagram_username FROM instagram_warming_leads WHERE id = $1 AND user_id = $2", lead_id, user_id)
        if not lead: return {"error": "Lead not found"}
        username = lead['instagram_username']

        # 1. Ghost Pool Teamwork (Multi-Account Retries)
        last_error = "Ghost Pool exhausted or Limit Reached (Max 5/day)"
        ghost_attempts = 0
        used_account_ids = []
        
        while ghost_attempts < 3:
            ghost_attempts += 1
            account = await self._get_available_ghost(user_id, used_account_ids)
            if not account: break
            used_account_ids.append(account['id'])
            sender = account['username']

            try:
                cl = await self._get_insta_client(account)
                if not cl:
                    logger.error(f"❌ Handshake Failed: Could not initialize Ghost @{sender}")
                    continue

                logger.info(f"🛰️ IG Warmer Ghost Pool (Attempt {ghost_attempts}): Using @{sender} for @{username}")

                # 🎭 HUMANOID PROFILE VISIT
                try:
                    visit_headers = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                        "Accept-Language": "en-US,en;q=0.9"
                    }
                    p_auth = f"{account['p_user']}:{account['p_pass']}@" if account.get('p_user') else ""
                    p_url = f"{account['proxy_type']}://{p_auth}{account['host']}:{account['port']}" if account.get('host') else None
                    async with httpx.AsyncClient(headers=visit_headers, follow_redirects=True, timeout=12.0, proxy=p_url) as client:
                        await client.get(f"https://www.instagram.com/{username}/")
                        # 📖 HUMAN READING: Taking time to browse the profile as a guest
                        await asyncio.sleep(random.uniform(12.5, 22.4))
                except: pass

                # 🔍 1. SEARCH BAR SIMULATION (Mimic typing into IG App)
                search_pause = random.uniform(10.5, 18.2)
                logger.info(f"--- 🔍 Human Search Simulation: Typing '@{username}' into Search Bar and waiting {search_pause:.1f}s... ---")
                try:
                    await asyncio.get_event_loop().run_in_executor(None, lambda: cl.search_users(username))
                    await asyncio.sleep(random.uniform(5.5, 9.0))
                except: pass

                # ✨ 2. FETCH PROFILE (Now perceived as a result of a search/visit)
                user_info = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: cl.user_info_by_username(username)
                )
                
                # 🛑 INDUSTRIAL COOLING: Mimic "Deep Reading" the bio and looking at the profile pic
                cooling_pause = random.uniform(22.0, 45.0)
                logger.info(f"--- 🧘‍♂️ Deep Reading Simulated: Examining @{username} for {cooling_pause:.1f}s... ---")
                await asyncio.sleep(cooling_pause)

                profile_pic_url = str(user_info.profile_pic_url or "")
                if profile_pic_url:
                    profile_pic_url = f"https://images.weserv.nl/?url={quote(profile_pic_url)}&w=150&h=150&fit=cover"

                posts = [] # Visuals disabled as per request

                # 🚀 QUALIFY & UPDATE
                await self._qualify_and_update(lead_id, user_id, 
                                             user_info.biography or "", 
                                             user_info.follower_count, 
                                             user_info.following_count, 
                                             user_info.full_name or "", 
                                             posts,
                                             profile_pic_url=profile_pic_url,
                                             is_private=user_info.is_private)
                
                # 🏁 INC SAFETY COUNTER
                await db.execute("UPDATE instagram_warming_accounts SET daily_usage_count = daily_usage_count + 1, updated_at = NOW() WHERE id = $1", account['id'])
                
                return {"success": True, "method": f"ghost (@{account['username']})"}

            except Exception as e:
                last_error = str(e)
                logger.warning(f"⚠️ Warming Ghost @{sender} failed: {e}")
                err_str = last_error.lower()
                
                # 🔍 DEAD LEAD DETECTION: If the user doesn't exist (404/Not Found)
                if any(x in err_str for x in ["not found", "404", "user not found"]):
                    logger.info(f"🚫 Removing Dead Lead: @{username} no longer exists. Purging from pool.")
                    await db.execute("UPDATE instagram_warming_leads SET status = 'rejected', bio = '[USER NOT FOUND]', updated_at = NOW() WHERE id = $1", lead_id)
                    return {"error": "Target user not found on Instagram."}

                if any(x in err_str for x in ["429", "login", "limit", "checkpoint", "challenge"]):
                    await db.execute("UPDATE instagram_warming_accounts SET status = 'rate_limited', updated_at = NOW() WHERE id = $1", account['id'])
                continue

        return {"error": f"All strategies failed: {last_error}"}

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

    async def harvest_lead_network(self, user_id: int, lead_id: int):
        """🚀 PHASE 2: Deep Scrape - Get Followers for exponential warming!"""
        if user_id in self._harvest_tasks:
            await db.execute("UPDATE instagram_warming_leads SET status = 'queued', updated_at = NOW() WHERE id = $1", lead_id)
            return

        lead = await db.fetchrow("SELECT instagram_username FROM instagram_warming_leads WHERE id = $1 AND user_id = $2", lead_id, user_id)
        if not lead: return
        username = lead['instagram_username']
        
        self._harvest_tasks[user_id] = lead_id
        
        try:
            # Pick an available ghost
            account = await self._get_available_ghost(user_id)
            
            if not account:
                logger.error("🛑 IG Warmer: No active or available ghost accounts (Limit Reached).")
                return

            cl = await self._get_insta_client(account)
            if not cl: return

            # 🎭 HUMANOID PROTOCOL: Pre-Harvest Browsing
            try:
                visit_headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9"
                }
                p_auth = f"{account['p_user']}:{account['p_pass']}@" if account.get('p_user') else ""
                p_url = f"{account['proxy_type']}://{p_auth}{account['host']}:{account['port']}" if account.get('host') else None
                async with httpx.AsyncClient(headers=visit_headers, follow_redirects=True, timeout=12.0, proxy=p_url) as client:
                    await client.get(f"https://www.instagram.com/{username}/")
                    await asyncio.sleep(random.uniform(6.0, 12.0))
            except: pass

            # 🔍 SEARCH BAR SIMULATION
            try:
                await asyncio.get_event_loop().run_in_executor(None, lambda: cl.search_users(username))
                await asyncio.sleep(random.uniform(3.0, 7.0))
            except: pass

            user_info = await asyncio.get_event_loop().run_in_executor(None, lambda: cl.user_info_by_username(username))
            
            # 🌀 HUMAN LIQUID SCROLLING: Fetch up to 3 pages (150 leads) with thumb-scroll delays
            followers_dict = {}
            next_max_id = ""
            
            for page in range(3):
                logger.info(f"--- 📡 Harvest Surge: Scrolling page {page+1}/3 for @{username}... ---")
                try:
                    chunk, next_max_id = await asyncio.get_event_loop().run_in_executor(
                        None, lambda max_id=next_max_id: cl.user_followers_v1_chunk(user_info.pk, max_amount=50, max_id=max_id)
                    )
                    for f in chunk:
                        followers_dict[f.pk] = f
                except Exception as page_err:
                    logger.warning(f"⚠️ Thumb scroll page {page+1} incomplete: {page_err}")
                    break
                
                if not next_max_id or len(followers_dict) >= 150:
                    break
                    
                # 🧘‍♂️ MANUAL THUMB SCROLL DELAY
                scroll_pause = random.uniform(8.5, 14.2)
                logger.info(f"--- 🧘‍♂️ Human Thumb Scrolled: Reading names and waiting {scroll_pause:.1f}s for next page... ---")
                await asyncio.sleep(scroll_pause)
            
            count = 0
            for f_user in followers_dict.values():
                status = await db.execute("""
                    INSERT INTO instagram_warming_leads (user_id, instagram_username, discovery_keyword, source, status) 
                    VALUES ($1, $2, $3, 'network_expansion', 'discovered') ON CONFLICT DO NOTHING
                """, user_id, f_user.username, f"follower_of_{username}")
                if status == "INSERT 0 1": count += 1
            
            await db.execute("UPDATE instagram_warming_leads SET status = 'harvested', updated_at = NOW() WHERE id = $1", lead_id)
            # 🏁 INC SAFETY COUNTER
            await db.execute("UPDATE instagram_warming_accounts SET daily_usage_count = daily_usage_count + 1, updated_at = NOW() WHERE id = $1", account['id'])
            logger.info(f"✅ Warming Harvest Complete: +{count} leads from @{username}")
            
            # Sync UI
            try:
                await manager.send_personal_message({"type": "instagram_lead_updated", "lead_id": lead_id, "status": "harvested"}, user_id)
            except: pass

        except Exception as e:
            logger.error(f"❌ Warming Harvest Failed: {e}")
        finally:
            self._harvest_tasks.pop(user_id, None)

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
        count = 0
        for idx, line in enumerate(lines):
            line = line.strip()
            if not line: continue
            
            # Detect Separator (| or :)
            sep = '|' if '|' in line else ':'
            parts = line.split(sep)
            
            username = ""
            password = ""
            session_id = None
            verification_code = None
            
            if len(parts) >= 2:
                username = parts[0].strip().lstrip('@')
                password = parts[1].strip()
                
                # Intelligent Extraction (look for long strings or common cookie keys)
                for p_idx, p in enumerate(parts[2:]):
                    p = p.strip()
                    if not p: continue
                    
                    if 'sessionid=' in p:
                        match = re.search(r'sessionid=([^; ]+)', p)
                        if match: session_id = match.group(1)
                    elif p_idx == 0 and len(p) > 20: 
                        session_id = p
                    elif p_idx == 1 or (p.isalnum() and len(p) <= 20):
                        # Potential 2FA code or secret
                        verification_code = p

            if not username or not password: continue
            
            # Rotate Proxy (Round Robin)
            proxy_id = None
            if proxies:
                proxy_id = proxies[count % len(proxies)]['id']
            
            await db.execute("""
                INSERT INTO instagram_warming_accounts (user_id, username, password, proxy_id, session_id, verification_code, status)
                VALUES ($1, $2, $3, $4, $5, $6, 'active')
                ON CONFLICT (username) DO UPDATE SET
                    password = EXCLUDED.password,
                    proxy_id = EXCLUDED.proxy_id,
                    session_id = EXCLUDED.session_id,
                    verification_code = EXCLUDED.verification_code,
                    status = 'active',
                    updated_at = NOW()
            """, user_id, username, password, proxy_id, session_id, verification_code)
            count += 1
            
        # 🚨 Emergency Wake-Up Override
        self.nap_end_times[user_id] = 0
        return count

instagram_warming_service = InstagramWarmingService()
