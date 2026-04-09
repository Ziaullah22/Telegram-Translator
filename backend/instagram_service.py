import io
import PIL.Image
import imagehash
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

# 🚨 SMART TELEMETRY: Force Python to print logs to the terminal so the user can see them!
logging.basicConfig(level=logging.INFO, format='%(levelname)s:     %(message)s')
logger = logging.getLogger(__name__)

class InstagramService:
    # --- Stage 1: Discovery ---

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
        
        for idx, keyword in enumerate(keywords):
            # Rotate proxy per keyword
            p_url = None
            if proxies_list:
                p = proxies_list[idx % len(proxies_list)]
                p_auth = f"{p['username']}:{p['password']}@" if p['username'] else ""
                p_url = f"{p['proxy_type']}://{p_auth}{p['host']}:{p['port']}"

            # 🛠️ Direct Username Detection (If it's a single word with _ or .)
            kw_clean = keyword.strip().lstrip('@')
            if ' ' not in kw_clean and len(kw_clean) > 3:
                logger.info(f"🎯 Direct Username Detected: @{kw_clean}")
                status = await db.execute("INSERT INTO instagram_leads (user_id, instagram_username, discovery_keyword, status) VALUES ($1, $2, $3, 'discovered') ON CONFLICT DO NOTHING", user_id, kw_clean, "direct_add")
                if status == "INSERT 0 1": new_count += 1

            # 🛠️ Multi-Search Engine Engine (DuckDuckGo + Google Fallback)
            mirrors = [
                f"https://html.duckduckgo.com/html/?q={quote(f'site:instagram.com \"{keyword}\"')}",
                f"https://www.google.com/search?q={quote(f'site:instagram.com \"{keyword}\"')}"
            ]

            for search_url in mirrors:
                # 🛠️ ATTEMPT 1: With Proxy
                success = False
                try:
                    headers = {"User-Agent": agents[idx % len(agents)], "Accept-Language": "en-US,en;q=0.9"}
                    async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=12.0, proxy=p_url) as client:
                        res = await client.get(search_url)
                        if res.status_code == 200:
                            # 🔍 Enhanced extraction (Catches redirects and direct links)
                            raw_matches = re.findall(r'instagram\.com/([a-zA-Z0-9._]{3,30})', res.text)
                            # Also look for google-style redirects: /url?q=...instagram.com/ziaullah_khaan/
                            redirect_matches = re.findall(r'instagram\.com%2F([a-zA-Z0-9._]{3,30})', res.text)
                            
                            all_matches = list(set(raw_matches + redirect_matches))
                            logger.info(f"Scan found {len(all_matches)} leads on {search_url}")
                            
                            # --- DISCOVERY WAVE LOGIC ---
                            for idx_u, u in enumerate(all_matches):
                                u_clean = u.lower().strip('./_ ')
                                if u_clean and u_clean not in {'reels', 'about', 'legal', 'terms', 'privacy', 'p', 'explore', 'stories', 'p.photos'}:
                                    if len(u_clean) > 2:
                                        logger.info(f"✅ Saving: @{u_clean}")
                                        discovery_results.append(u_clean)
                                        status = await db.execute("INSERT INTO instagram_leads (user_id, instagram_username, discovery_keyword, status) VALUES ($1, $2, $3, 'discovered') ON CONFLICT DO NOTHING", user_id, u_clean, keyword)
                                        if status == "INSERT 0 1": new_count += 1
                                
                                # 🌬️ DISCOVERY BREATHE: Every 15 profiles (Human Pattern)
                                if (idx_u + 1) % 15 == 0:
                                    breathe = random.uniform(3.0, 5.0)
                                    logger.info(f"--- 🍃 Discovery-Breathe: Pausing {breathe:.1f}s for result wave... ---")
                                    await asyncio.sleep(breathe)
                            success = True
                except Exception as e:
                    logger.warning(f"Proxy failed on {search_url}, attempting Smart Bypass (Local IP)...")

                # 💡 ATTEMPT 2: Smart Bypass (Local IP)
                if not success:
                    try:
                        async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=10.0) as client:
                            res = await client.get(search_url)
                            if res.status_code == 200:
                                matches = re.findall(r'instagram\.com/([a-zA-Z0-9._]{3,30})', res.text)
                                for u in matches:
                                    u_clean = u.lower().strip('./_ ')
                                    if u_clean and u_clean not in {'reels', 'about', 'legal', 'terms', 'privacy', 'p', 'explore', 'stories'}:
                                        if len(u_clean) > 2:
                                            logger.info(f"✅ Extracted & Saving (Bypass): @{u_clean}")
                                            await db.execute("""
                                                INSERT INTO instagram_leads (user_id, instagram_username, discovery_keyword, status) 
                                                VALUES ($1, $2, $3, 'discovered') 
                                                ON CONFLICT (user_id, instagram_username) DO UPDATE SET 
                                                    discovery_keyword = EXCLUDED.discovery_keyword,
                                                    status = 'discovered',
                                                    updated_at = NOW()
                                            """, user_id, u_clean, keyword)
                                            discovery_results.append(u_clean)
                                            new_count += 1
                    except Exception as e:
                        logger.error(f"Discovery total failure on {search_url}: {e}")
        
        # 🏁 RETURN SUMMARY: Show total matches vs actually new
        logger.info(f"📊 Mission Summary: Found {len(discovery_results)} total matches, {new_count} were NEW leads.")
        return new_count

    # --- Stage 2: Analysis ---

    # --- Data Utils ---
    
    # --- Universal Qualification Engine ---
    
    async def _qualify_and_update(self, lead_id: int, user_id: int, bio: str, followers: int, following: int, full_name: str, recent_posts: List[dict], is_private: bool = False):
        """Internal worker to analyze profile data and update lead status."""
        logger.info(f"📊 Analyzing @Lead {lead_id} (Followers: {followers}, Following: {following}), Bio: '{bio[:30]}...', Private: {is_private})")
        
        # 🏎️ SAFETY CHECK
        if not bio and followers == 0:
            logger.warning(f"⚠️ Lead {lead_id} has NO data. Marking as 'failed' for retry.")
            await db.execute("UPDATE instagram_leads SET status = 'failed', updated_at = NOW() WHERE id = $1", lead_id)
            return "failed"

        settings = await self.get_filter_settings(user_id)
        is_qualified = True
        
        # 1. Follower Count Match
        if settings['min_followers'] > 0 and followers < settings['min_followers']: is_qualified = False
        if is_qualified and settings['max_followers'] > 0 and followers > settings['max_followers']: is_qualified = False
            
        # 2. Bio Keyword Match
        if is_qualified and not self._check_bio_keywords(bio, settings['bio_keywords']):
            is_qualified = False

        # 3. Picture Visual Match (Using the uploaded target hash)
        target_hashes = settings.get('sample_hashes', [])
        if is_qualified and target_hashes:
            if not recent_posts:
                logger.info("❌ Visual Scanner rejected lead: Lead has NO photos to scan.")
                is_qualified = False
            else:
                logger.info("🔍 Visual Scanner Enabled: Checking recent photos against target picture...")
                image_matched = False
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
                                            
                                            # Backwards compatibility check
                                            if len(p_hashes) == 2 and len(t_hashes) == 2:
                                                p_obj1, p_obj2 = imagehash.hex_to_hash(p_hashes[0]), imagehash.hex_to_hash(p_hashes[1])
                                                t_obj1, t_obj2 = imagehash.hex_to_hash(t_hashes[0]), imagehash.hex_to_hash(t_hashes[1])
                                                diff1, diff2 = p_obj1 - t_obj1, p_obj2 - t_obj2
                                                
                                                logger.info(f"📐 Multi-Dimensional AI: pHash={diff1}/64, dHash={diff2}/64")
                                                # Both dimensions must pass structural checks
                                                if diff1 <= 32 and diff2 <= 38: # 🧠 Increased breathing room: allow lighting changes, still block smooth faces.
                                                    image_matched = True
                                                    logger.info(f"✅ Visual Scanner: Perfect Multi-Dimensional Match!")
                                                    break
                                            else:
                                                # Legacy fallback
                                                diff = imagehash.hex_to_hash(p_hashes[0]) - imagehash.hex_to_hash(t_hashes[0])
                                                if diff <= 26:
                                                    image_matched = True
                                                    break
                            except Exception as e:
                                logger.warning(f"⚠️ Failed to scan picture: {e}")
                            if image_matched: break
                except Exception as e:
                    logger.warning(f"⚠️ Visual Scanner failed: {e}")
                    
                if not image_matched:
                    logger.info("❌ Visual Scanner rejected lead: No photos matched the mathematical standard.")
                    is_qualified = False

        new_status = 'qualified' if is_qualified else 'rejected'
        
        # 🏎️ SAVE EVERYTHING: Full Name, Bio, Followers, Posts
        posts_json = json.dumps(recent_posts or [])
        await db.execute("""
            UPDATE instagram_leads 
            SET status = $1, bio = $2, follower_count = $3, following_count = $4, full_name = $5, recent_posts = $6, is_private = $7, updated_at = NOW() 
            WHERE id = $8
        """, new_status, bio, followers, following, full_name, posts_json, is_private, lead_id)
        
        logger.info(f"✨ Lead {lead_id} fully saved as: {new_status.upper()}")
        
        # 🏎️💨 INSTANT UI FLASH: Tell the frontend to refresh THIS lead immediately!
        try:
            await manager.send_personal_message({
                "type": "instagram_lead_updated",
                "lead_id": lead_id,
                "status": new_status
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
        lead = await db.fetchrow("SELECT instagram_username FROM instagram_leads WHERE id = $1 AND user_id = $2", lead_id, user_id)
        if not lead: return {"error": "Lead not found"}
        username = lead['instagram_username']

        # 1. Strategy 1: Ghost Pool Teamwork (Multi-Account Retries)
        last_error = "Ghost Pool exhausted"
        ghost_attempts = 0
        used_account_ids = []
        proxy_url = None

        while ghost_attempts < 3:
            ghost_attempts += 1
            account = await db.fetchrow(f"""
                SELECT a.*, p.host, p.port, p.username as p_user, p.password as p_pass, p.proxy_type 
                FROM instagram_accounts a LEFT JOIN instagram_proxies p ON a.proxy_id = p.id
                WHERE a.user_id = $1 AND a.status = 'active' 
                {"AND a.id NOT IN (" + ",".join(map(str, used_account_ids)) + ")" if used_account_ids else ""}
                ORDER BY last_used_at ASC NULLS FIRST LIMIT 1
            """, user_id)

            if not account: break
            used_account_ids.append(account['id'])
            sender = account['username']

            try:
                cl = await self._get_insta_client(account)
                if not cl:
                    logger.error(f"❌ Handshake Failed: Could not initialize Ghost @{sender}")
                    continue

                logger.info(f"🛰️ Ghost Pool (Attempt {ghost_attempts}): Using @{sender} for @{username}")

                # 🚨 SMART TELEMETRY: Record deployment
                await db.execute("UPDATE instagram_accounts SET last_used_at = NOW() WHERE id = $1", account['id'])
                
                # 🎭 HUMANOID PROFILE VISIT: Open the page as a browser-guest first
                try:
                    visit_headers = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                        "Accept-Language": "en-US,en;q=0.9"
                    }
                    async with httpx.AsyncClient(headers=visit_headers, follow_redirects=True, timeout=12.0, proxy=proxy_url) as client:
                        await client.get(f"https://www.instagram.com/{username}/")
                        reading_pause = random.uniform(7.2, 13.5)
                        logger.info(f"--- 📖 Human Reading Simulated: Looking at @{username} for {reading_pause:.1f}s... ---")
                        await asyncio.sleep(reading_pause)
                except: pass

                # 🔍 1. SEARCH BAR SIMULATION (Mimic typing into IG App)
                # 🛑 INDUSTRIAL DELAY: Datacenter proxies need more "thinking time"
                search_pause = random.uniform(8.5, 15.2)
                logger.info(f"--- 🔍 Human Search Simulation: Typing '@{username}' into Search Bar and waiting {search_pause:.1f}s... ---")
                try:
                    await asyncio.get_event_loop().run_in_executor(None, lambda: cl.search_users(username))
                except Exception as search_ex:
                    logger.warning(f"Search simulation skipped (non-critical): {search_ex}")
                await asyncio.sleep(search_pause)

                # ✨ FETCH PROFILE (Private API Handshake)
                user_info = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: cl.user_info_by_username(username)
                )

                # ✨ SUCCESS: Save FULL results and qualify
                logger.info(f"✨ Ghost Account @{sender} identified {username} successfully!")
                
                posts = []
                try:
                    logger.info(f"📸 Capturing Grid Feed for @{username}...")
                    cl = await self._get_insta_client(account)
                    if cl:
                        # 🧬 PRIVATE HANDSHAKE: Talk directly to mobile media stream
                        medias = await asyncio.get_event_loop().run_in_executor(
                            None, lambda: cl.user_medias(user_info.pk, 3)
                        )
                        for m in medias:
                            t_url = str(m.thumbnail_url or (m.resources[0].thumbnail_url if m.resources else ""))
                            if t_url:
                                p_url = f"https://images.weserv.nl/?url={quote(t_url)}&w=300&h=300&fit=cover"
                                posts.append({
                                    "url": f"https://instagram.com/p/{m.code}",
                                    "display_url": p_url,
                                    "caption": m.caption_text or ""
                                })
                    logger.info(f"✅ Success: Captured {len(posts)} posts for @{username} via Private-API.")
                except Exception as post_err:
                    logger.warning(f"⚠️ Post capture failed for @{username}: {post_err}")

                # 🚀 PHASE 1: Complete Identification & Assign Account
                await self._qualify_and_update(lead_id, user_id, 
                                             user_info.biography or "", 
                                             user_info.follower_count, 
                                             user_info.following_count, 
                                             user_info.full_name or "", 
                                             posts,
                                             is_private=user_info.is_private)
                
                # 🔒 LOCK ASSIGNMENT: This lead now "belongs" to this account for consistent human history
                try:
                   await db.execute("UPDATE instagram_leads SET assigned_account_id = $1, assigned_account_name = $2 WHERE id = $3", account['id'], account['username'], lead_id)
                except: pass

                logger.info(f"🚀 Phase 1 Complete: '@{username}' identified and assigned to @{account['username']}.")
                return {"success": True, "method": f"ghost (@{account['username']})"}

            except Exception as e:
                last_error = str(e)
                logger.warning(f"⚠️ Ghost account @{sender} failed: {e}. Retrying pool...")
                
                # 🚨 SMART TELEMETRY: Catch rate limits and auto-tag the specific account
                err_str = last_error.lower()
                if any(x in err_str for x in ["429", "login", "unauthorized", "rate", "limit", "checkpoint", "challenge", "bad request", "json query", "expecting value", "graphql", "char 0"]):
                    logger.error(f"🚨 Block/Challenge Detected for @{sender}! Auto-Tagging as 'rate_limited'.")
                    await db.execute("UPDATE instagram_accounts SET status = 'rate_limited' WHERE id = $1", account['id'])
                
                continue

        # 2. Strategy 2: Stealth Mirror Fallbacks (Picuki/Imginn)
        stealth_headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"}
        mirrors = [
            (f"https://imginn.com/{username}/", r'<p>(.*?)</p>'),
            (f"https://www.picuki.com/profile/{username}", r'profile_description">(.*?)</div>'),
            (f"https://dumpor.io/v/{username}", r'user-description">(.*?)</div>')
        ]
        
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers=stealth_headers, proxy=proxy_url) as client:
            for url, bio_rgx in mirrors:
                try:
                    res = await client.get(url)
                    if res.status_code == 200:
                        # 1. Capture Bio
                        bi = re.search(bio_rgx, res.text, re.S | re.I)
                        f_bio = re.sub(r'<[^>]+>', ' ', bi.group(1)).strip() if bi else ""
                        
                        # 2. Capture Grid (Mirror Mode - Enhanced Regex for Lazy-Loading)
                        mirror_posts = []
                        # Look for cdninstagram URLs in any attribute (src, data-src, content, etc)
                        img_matches = re.findall(r'(?:src|data-src|content)="(https://[^"]*?cdninstagram\.com[^"]*?)"', res.text)
                        # Filter for high-res grid patterns and unique ones
                        unique_imgs = list(set(img_matches))
                        for img_c in unique_imgs[:3]:
                            mirror_posts.append({
                                "url": f"https://instagram.com/{username}",
                                "display_url": f"https://images.weserv.nl/?url={quote(img_c)}&w=300&h=300&fit=cover",
                                "caption": "Metadata capture successful 🛰️"
                            })
                        
                        logger.info(f"✨ Mirror Discovery found bio and {len(mirror_posts)} posts for @{username} (Lazy-Load Bypass Engaged!)")
                        
                        # 3. Qualify & Save
                        new_status = await self._qualify_and_update(lead_id, user_id, 
                                                                  f_bio, 0, 0,
                                                                  f"{username}_mirror",
                                                                  mirror_posts,
                                                                  is_private=False) # Mirror can't easily tell, assume pub
                        return {"success": True, "new_status": new_status, "source": "mirror_stealth"}
                except: continue

        # 3. Strategy 3: Search Snippet Fallback
        try:
            search_url = f"https://html.duckduckgo.com/html/?q={quote(f'site:instagram.com \"{username}\"')}"
            async with httpx.AsyncClient(headers=stealth_headers, timeout=12.0) as client:
                res = await client.get(search_url)
                if res.status_code == 200:
                    snippet_mx = re.search(r'Instagram photos and videos \. (.*?) - Instagram', res.text, re.I)
                    if snippet_mx:
                        f_bio = snippet_mx.group(1).strip()
                        await db.execute("UPDATE instagram_leads SET bio = $1, updated_at = NOW() WHERE id = $2", f_bio, lead_id)
                        new_status = await self._qualify_and_update(lead_id, user_id, f_bio, 0, 0)
                        return {"status": "success", "source": "search_snippet"}
        except: pass

        return {"error": f"All strategies failed: {last_error}"}

    # --- Data Utils ---

    async def get_leads(self, user_id: int, status: str = None, keyword: str = None, limit: int = 5000, offset: int = 0):
        """Retrieve Instagram leads with filtering and VIP sorting."""
        query = "SELECT * FROM instagram_leads WHERE user_id = $1"
        params = [user_id]
        if status:
            if status == 'qualified':
                query += " AND status IN ('qualified', 'analyzed', 'vetted', 'harvested')"
            elif status == 'rejected':
                query += " AND status IN ('rejected', 'discarded')"
            elif status == 'discovered':
                query += " AND status IN ('discovered', 'queued')"
            else:
                params.append(status)
                query += f" AND status = ${len(params)}"
        else:
            # Exclude discarded from 'all' view to keep it clean, unless explicitly asked for rejected
            query += " AND status != 'discarded'"
            
        if keyword: params.append(f"%{keyword}%"); query += f" AND (discovery_keyword ILIKE ${len(params)} OR instagram_username ILIKE ${len(params)})"
        # 🏆 ACTION-FIRST INDUSTRIAL SEQUENCE:
        # 0. Waiting Approval (Approve & Scrape) -> ABSOLUTE TOP (0)
        # 1. Scrape Complete (Mission Finish)    -> SECOND (1)
        # 2. Main Search Leads (Discovery Core)  -> THIRD (2)
        # 3. Follower Wave (Network Expansion)   -> BOTTOM (3)
        query += f""" ORDER BY (
            CASE 
                WHEN status IN ('analyzed', 'qualified') THEN 0
                WHEN status IN ('harvested', 'vetted') THEN 1 
                WHEN source != 'network_expansion' THEN 2 
                ELSE 3 
            END) ASC, updated_at DESC, created_at DESC LIMIT {limit} OFFSET {offset}"""
        rows = await db.fetch(query, *params)
        leads = []
        for row in rows:
            d = dict(row)
            # Parse recent_posts JSON
            try:
                d['recent_posts'] = json.loads(d.get('recent_posts') or '[]')
            except:
                d['recent_posts'] = []
            leads.append(d)
        return leads

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
            if account:
                logger.info(f"🎯 Human Consistency: Using assigned account @{account['username']} for @{username}")

        used_account_ids = []
        harvest_success = False
        count = 0
        
        # If no assigned account (or it's banned), pick a new one from the pool
        for ghost_attempt in range(3):
            if not account:
                # Pick the least-recently-used active account not already tried
                id_exclusion = f"AND a.id NOT IN ({','.join(map(str, used_account_ids))})" if used_account_ids else ""
                account = await db.fetchrow(f"""
                    SELECT a.*, p.host, p.port, p.username as p_user, p.password as p_pass, p.proxy_type 
                    FROM instagram_accounts a LEFT JOIN instagram_proxies p ON a.proxy_id = p.id
                    WHERE a.user_id = $1 AND a.status = 'active' {id_exclusion}
                    ORDER BY last_used_at ASC NULLS FIRST LIMIT 1
                """, user_id)
            
            if not account:
                logger.error("🛑 Ghost Pool Exhausted: No more active accounts to try.")
                break

            sender = account['username']
            used_account_ids.append(account['id'])
            logger.info(f"🕸️ Viral Harvest (Attempt {ghost_attempt+1}): Using @{sender} to expand @{username}'s network...")
        
            try:
                cl = await self._get_insta_client(account)
                if not cl:
                    logger.warning(f"⚠️ Handshake Failed for @{sender}. Trying next ghost...")
                    # Evict broken client from cache
                    self._insta_clients.pop(sender, None)
                    continue

                # 🏎️ UPDATE LAST USED
                await db.execute("UPDATE instagram_accounts SET last_used_at = NOW() WHERE id = $1", account['id'])
                
                # ✨ FETCH TARGET INFO (Private API)
                user_info = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: cl.user_info_by_username(username)
                )

                # 🧘‍♂️ PRE-SURGE MEDITATION
                meditation_pause = random.uniform(22.5, 38.3)
                logger.info(f"--- 🧘‍♂️ Human Meditation Active: Waiting {meditation_pause:.1f}s to build session trust... ---")
                await asyncio.sleep(meditation_pause)

                # 🛠️ CAPTURE FOLLOWERS (Manual Thumb Pagination)
                logger.info(f"👥 Scoping 150 Followers for @{username} using Manual Thumb Pagination...")
                followers_dict = {}
                next_max_id = ""
                
                for chunk_idx in range(3):  # 3 pages of 50 = 150
                    logger.info(f"--- 📡 Fetching followers page {chunk_idx + 1}/3... ---")
                    try:
                        chunk_users, next_max_id = await asyncio.get_event_loop().run_in_executor(
                            None, lambda max_id=next_max_id: cl.user_followers_v1_chunk(user_info.pk, max_amount=50, max_id=max_id)
                        )
                        for u in chunk_users:
                            followers_dict[u.pk] = u
                    except Exception as chunk_ex:
                        logger.warning(f"⚠️ Thumb scroll page {chunk_idx + 1} incomplete: {chunk_ex}")
                        break
                    
                    if not next_max_id or len(followers_dict) >= 150:
                        break
                        
                    # 🧘‍♂️ MANUAL THUMB SCROLL DELAY
                    if chunk_idx < 2:
                        scroll_pause = random.uniform(10.5, 16.2)
                        logger.info(f"--- 🧘‍♂️ Human Thumb Scrolled: Reading names and waiting {scroll_pause:.1f}s for next page... ---")
                        await asyncio.sleep(scroll_pause)
                
                for f_id, f_user in followers_dict.items():
                    try:
                        # Safe insert — works whether or not the constraint exists
                        try:
                            await db.execute("""
                                INSERT INTO instagram_leads (user_id, instagram_username, discovery_keyword, source, status) 
                                VALUES ($1, $2, $3, 'network_expansion', 'discovered') 
                                ON CONFLICT (user_id, instagram_username) DO UPDATE SET
                                    status = 'discovered', updated_at = NOW()
                            """, user_id, f_user.username, f"follower_of_{username}")
                        except Exception:
                            # Fallback: plain insert ignoring any conflict
                            await db.execute("""
                                INSERT INTO instagram_leads (user_id, instagram_username, discovery_keyword, source, status) 
                                VALUES ($1, $2, $3, 'network_expansion', 'discovered') ON CONFLICT DO NOTHING
                            """, user_id, f_user.username, f"follower_of_{username}")
                        count += 1
                        try:
                            await manager.send_personal_message({"type": "new_lead_discovered", "username": f_user.username}, user_id)
                        except: pass
                    except Exception as loop_e:
                        logger.warning(f"⚠️ Skip profile during harvest: {loop_e}")
                        continue
                
                harvest_success = True
                logger.info(f"✅ Follower Surge Complete for @{username}! {count} leads added.")
                break  # Mission accomplished — exit the retry loop

            except Exception as e:
                err_str = str(e).lower()
                logger.error(f"❌ Harvest Phase failed for @{sender}: {e}")
                # Mark this account as rate-limited/dead and evict from cache
                if any(x in err_str for x in ["429", "login", "logout", "unauthorized", "rate", "limit", "checkpoint", "challenge"]):
                    await db.execute("UPDATE instagram_accounts SET status = 'rate_limited' WHERE id = $1", account['id'])
                self._insta_clients.pop(sender, None)
                logger.info(f"🔄 Retrying with next ghost account...")
                continue

        # 🕵️ If ALL ghost accounts failed, try Ghost-less fallback
        if not harvest_success:
            logger.info(f"--- 🛰️ RESILIENT FALLBACK: All ghosts failed for @{username}. Attempting Ghost-less Search Surge... ---")
            fallback_mirrors = [
                f"https://www.picuki.com/profile/{username}",
                f"https://html.duckduckgo.com/html/?q={quote(f'site:instagram.com \"follower of {username}\"')}"
            ]
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"}) as client:
                for url in fallback_mirrors:
                    try:
                        res = await client.get(url)
                        if res.status_code == 200:
                            m_matches = re.findall(r'instagram\.com/([a-zA-Z0-9._]{3,30})', res.text)
                            for m_user in set(m_matches):
                                if m_user.lower() not in {username.lower(), 'reels', 'about', 'legal', 'terms', 'privacy'}:
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
            # If lead was originally REJECTED, keep it rejected (Force Scrape mode)
            # Otherwise upgrade to 'harvested' to signal completion
            final_status = original_status if original_status == 'rejected' else 'harvested'
            await db.execute("UPDATE instagram_leads SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3", final_status, lead_id, user_id)
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
                COUNT(*) FILTER (WHERE status != 'discarded') as total, 
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

    async def get_accounts(self, user_id: int):
        rows = await db.fetch("SELECT i.*, p.host as proxy_host FROM instagram_accounts i LEFT JOIN instagram_proxies p ON i.proxy_id = p.id WHERE i.user_id = $1", user_id)
        return [dict(row) for row in rows]

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
                import urllib.parse
                clean_session_str = urllib.parse.unquote(manual_session)
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
            await db.execute("""
                INSERT INTO instagram_accounts (user_id, username, password, proxy_id, status, session_id, verification_code, last_used_at)
                VALUES ($1, $2, $3, $4, 'active', $5, $6, NOW())
                ON CONFLICT (username) DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    password = EXCLUDED.password,
                    proxy_id = EXCLUDED.proxy_id,
                    status = 'active',
                    session_id = EXCLUDED.session_id,
                    verification_code = EXCLUDED.verification_code,
                    last_used_at = NOW()
            """, user_id, username, password, db_proxy_id, session_id, v_code)
            
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
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """)
            await db.execute("""
                ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP;
            """)
        except Exception as e:
            logger.warning(f"Settings table init: {e}")

    async def get_filter_settings(self, user_id: int):
        row = await db.fetchrow("SELECT * FROM instagram_filter_settings WHERE user_id = $1", user_id)
        if row:
            res = dict(row)
            res['sample_hashes'] = json.loads(res.get('sample_hashes') or '[]')
            return res
        return {"user_id": user_id, "bio_keywords": "", "min_followers": 0, "max_followers": 0, "sample_hashes": []}

    async def save_filter_settings(self, user_id: int, bio_keywords: str, min_followers: int, max_followers: int, sample_hashes: List[str] = None):
        h_json = json.dumps(sample_hashes or [])
        await db.execute("""
            INSERT INTO instagram_filter_settings (user_id, bio_keywords, min_followers, max_followers, sample_hashes, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (user_id) DO UPDATE
            SET bio_keywords = $2, min_followers = $3, max_followers = $4, sample_hashes = $5, updated_at = NOW()
        """, user_id, bio_keywords, min_followers, max_followers, h_json)
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

    def _check_bio_keywords(self, bio: str, keywords_raw: str) -> bool:
        """Returns True if lead passes keyword filter (or no filter set)."""
        if not keywords_raw or not keywords_raw.strip():
            return True  # No filter set = everyone passes
        if not bio:
            return False  # Filter is set but lead has no bio = reject
        keywords = [k.strip().lower() for k in keywords_raw.split(',') if k.strip()]
        bio_lower = bio.lower()
        return any(kw in bio_lower for kw in keywords)

    def _check_follower_range(self, followers: int, min_f: int, max_f: int) -> bool:
        """Returns True if follower count is within range (0 = no limit)."""
        if min_f > 0 and followers < min_f:
            return False
        if max_f > 0 and followers > max_f:
            return False
        return True

    async def _analysis_worker(self, user_id: int):
        """🚀 THE AUTO-PILOT WORKER: Scans leads and applies bio/follower filters"""
        logger.info(f"Auto-Pilot Analysis Worker started for User {user_id}")
        self.workers[user_id] = True
        
        try:
            while self.workers.get(user_id):
                # 1. Fetch filter settings for this user
                settings = await self.get_filter_settings(user_id)

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
                    # After the surge finishes, restart the loop to check for more queued items!
                    continue

                # 2. Peek for the NEXT discovered lead
                lead = await db.fetchrow("""
                    SELECT id FROM instagram_leads 
                    WHERE user_id = $1 AND status = 'discovered' 
                    ORDER BY created_at DESC LIMIT 1
                """, user_id)
                
                if not lead:
                    logger.info(f"No more leads to analyze for User {user_id}. Auto-Pilot Resting. 😴")
                    # 🛰️ REAL-TIME UI SYNC: Inform the frontend that the mission is complete!
                    try:
                        await manager.send_personal_message({
                            "type": "auto_analyze_stopped",
                            "status": "completed",
                            "message": "🏁 Mission Complete: All leads have been analyzed!"
                        }, user_id)
                    except: pass
                    break
                
                # 3. PERFORM DEEP ANALYSIS
                logger.info(f"Auto-Pilot Analysis: Processing Lead ID {lead['id']}...")
                try:
                    # 🛰️ VISIBILITY SYNC: Tell the UI exactly which lead we are working on!
                    try:
                        await manager.send_personal_message({
                            "type": "auto_analyze_started",
                            "lead_id": lead['id']
                        }, user_id)
                    except: pass

                    # analyze_lead now handles EVERYTHING: Info, Visuals, and Qualification rules.
                    result = await self.analyze_lead(user_id, lead['id'])
                    
                    if "error" in result:
                        logger.error(f"Auto-Pilot Lead {lead['id']} failed: {result['error']}. Skipping...")
                        # 🛡️ PROTECT THE QUEUE: Move failed leads to 'failed' status so they don't block the worker!
                        await db.execute("UPDATE instagram_leads SET status = 'failed' WHERE id = $1", lead['id'])
                    else:
                        status = result.get("new_status", "analyzed")
                        logger.info(f"✨ Lead {lead['id']} finished with status: {status.upper()}")

                except Exception as e:
                    logger.error(f"Auto-Pilot error on Lead {lead['id']}: {e}")
                finally:
                    # 🏁 RELEASE UI LOCK: Lead is done!
                    try:
                        await manager.send_personal_message({
                            "type": "auto_analyze_finished",
                            "lead_id": lead['id']
                        }, user_id)
                    except: pass
                
                # 4. SLOW HUMAN SLEEP (Anti-Detect Mode Enabled)
                # 🛑 INDUSTRIAL DELAY: Mandatory cooling period for Datacenter IPs
                delay = random.uniform(120.5, 185.0)
                logger.info(f"Auto-Pilot Waiting {delay:.1f}s to mimic natural human breaks before next target...")
                
                # 🛰️ FEEDBACK SYNC: Tell the UI we are resting
                try:
                    await manager.send_personal_message({
                        "type": "auto_analyze_resting",
                        "duration": int(delay)
                    }, user_id)
                except: pass
                
                await asyncio.sleep(delay)
                
        except Exception as e:
            logger.error(f"Critical Auto-Pilot Worker failure: {e}")
        finally:
            self.workers[user_id] = False
            logger.info(f"Auto-Pilot Analysis Worker stopped for User {user_id}")

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
        cl = Client()
        cl.delay_range = [2, 5]
        
        # 🧪 STABILITY INJECTION: Use Web-Identity to bypass mobile parsing bugs!
        cl.set_device({
            "app_version": "385.0.0.47.74",
            "manufacturer": "Instagram",
            "model": "Web",
            "device": "Web",
        })
        cl.user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        cl.public_api_key = "936619743392459" 
        
        # Proxy Support
        if account_row.get('host'):
            p_auth = f"{account_row['p_user']}:{account_row['p_pass']}@" if account_row.get('p_user') else ""
            p_url = f"{account_row['proxy_type']}://{p_auth}{account_row['host']}:{account_row['port']}"
            cl.set_proxy(p_url)
            
        try:
            session_id = account_row.get('session_id')
            if session_id and isinstance(session_id, str) and len(session_id) > 5:
                try:
                    # Use sessionid cookie login (safest method)
                    logger.info(f"Session login for @{username}...")
                    cl.login_by_sessionid(session_id)
                except Exception as sess_err:
                    logger.warning(f"⚠️ Session Login failed for @{username} ({sess_err}). Falling back to fresh Auth...")
                    # Fallback Logic: Password login
                    cl.login(username, account_row['password'])
            else:
                # Fallback: password login with manual 2FA support
                v_code = account_row.get('verification_code')
                if v_code:
                    logger.info(f"Manual 2FA Handshake for @{username} (Code: {v_code})...")
                    cl.login(username, account_row['password'], verification_code=v_code)
                else:
                    logger.info(f"Password login for @{username}...")
                    cl.login(username, account_row['password'])
            
            self._insta_clients[username] = cl
            logger.info(f"✅ Ghost @{username} logged in successfully and authorized.")
            return cl
        except Exception as e:
            logger.error(f"Login failed for @{username}: {e}")
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

instagram_service = InstagramService()
