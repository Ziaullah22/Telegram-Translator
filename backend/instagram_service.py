import os
import io
import time
from datetime import datetime
import PIL.Image
import imagehash
import httpx
import re
import json
import logging
import asyncio
import random
from urllib.parse import quote
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
            kw_search_query = f'site:instagram.com "{keyword}"'
            mirrors = [
                f"https://html.duckduckgo.com/html/?q={quote(kw_search_query)}",
                f"https://www.google.com/search?q={quote(kw_search_query)}"
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
        
        # 1. Follower Count Match
        if settings['min_followers'] > 0 and followers < settings['min_followers']: is_qualified = False
        if is_qualified and settings['max_followers'] > 0 and followers > settings['max_followers']: is_qualified = False
            
        # 2. Picture Visual Match (AI Vision + Hashing Fallback)
        visual_niche = settings.get('visual_niche', '')
        target_hashes = settings.get('sample_hashes', [])
        
        # 🧠 DEEP AI ANALYSIS (Gemma Powered) - Moved up to be the PRIMARY judge
        await update_ui("Gemma 4: Analyzing Bio & Intent...")
        logger.info(f"🧠 [Gemma 4] Analyzing @{full_name}...")
        ai_result = await instagram_ai.analyze_lead_deep({
            "username": full_name,
            "bio": bio,
            "followers": followers
        })
        
        if ai_result and "error" not in ai_result:
            ai_analysis.update(ai_result)
            score = ai_result.get("intent_score", 0)
            if ai_result.get("quality") == "high":
                score = max(score, 90)
            logger.info(f"✨ [Gemma 4] Analysis Complete. Score: {score}, Niche: {ai_result.get('niche')}")
        else:
            logger.warning(f"⚠️ [Gemma 4] AI was unavailable or returned error: {ai_result.get('error', 'Unknown Error')}")

        # ⚖️ THE DECISION ENGINE: Use AI Score + Keywords
        is_qualified = True
        
        # 1. AI Score Filter (Must be > 70 if we have a score)
        if score > 0 and score < 70:
            logger.info(f"❌ AI Rejected lead: Intent Score {score}% is too low.")
            is_qualified = False
            
        # 2. Bio Keyword Match (Acts as a secondary booster or filter)
        # If score is high (90+), we ignore keywords. Otherwise, we check them.
        if is_qualified and score < 90 and not self._check_bio_keywords(bio, settings['bio_keywords']):
            logger.info("❌ Keyword Filter rejected lead: No matching keywords found in bio.")
            is_qualified = False

        # 3. Visual Match Filter (Only if enabled)
        if is_qualified and (visual_niche or target_hashes):
            if not recent_posts:
                reason = "Visual Scanner rejected lead: Lead has NO photos to scan."
                logger.info(f"❌ {reason}")
                is_qualified = False
                ai_analysis['vision_reason'] = reason
            else:
                image_matched = False
                # Try AI Vision FIRST if niche is described
                if visual_niche:
                    await update_ui(f"AI Vision: Scanning for '{visual_niche}'...")
                    logger.info(f"👁️ AI VISION ACTIVE: Checking photos for '{visual_niche}'...")
                    async with httpx.AsyncClient(timeout=20.0) as client:
                        for post in recent_posts[:2]:
                            try:
                                res = await client.get(post['display_url'])
                                if res.status_code == 200:
                                    import base64
                                    img_b64 = base64.b64encode(res.content).decode('utf-8')
                                    vision_res = await instagram_ai.analyze_vision(img_b64, visual_niche)
                                    if vision_res.get('match'):
                                        reason = vision_res.get('reason', 'Visual match confirmed.')
                                        logger.info(f"✅ AI Vision Match: {reason}")
                                        image_matched = True
                                        ai_analysis['vision_reason'] = reason
                                        break
                                    else:
                                        logger.info(f"❌ AI Vision Mismatch: {vision_res.get('reason', '')}")
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
        lead = await db.fetchrow("SELECT instagram_username FROM instagram_leads WHERE id = $1 AND user_id = $2", lead_id, user_id)
        if not lead: return {"error": "Lead not found"}
        username = lead['instagram_username']

        # 1. Strategy 1: Ghost Pool Teamwork (Single Account Attempt) - TEMPORARILY DISABLED FOR TESTING
        """
        account = await db.fetchrow(f\"\"\"
            SELECT a.*, p.host, p.port, p.username as p_user, p.password as p_pass, p.proxy_type 
            FROM instagram_accounts a LEFT JOIN instagram_proxies p ON a.proxy_id = p.id
            WHERE a.user_id = $1 AND a.status = 'active' 
            ORDER BY last_used_at ASC NULLS FIRST LIMIT 1
        \"\"\", user_id)

        if not account:
            logger.warning(f"⚠️ No active Ghost accounts available for {user_id}")
            return {"error": "No accounts available"}

        sender = account['username']
        try:
            logger.info(f"🛰️ Ghost Mission: Using @{sender} for @{username}")

            # ── SAFETY CHECK: 24h LOCK & 36h FREEZE ──
            if await self._check_usage_limit(account['id']):
                logger.warning(f"⏳ Account @{sender} is currently locked (Usage Limit).")
                return {"error": "Account locked"}

            if account.get('frozen_until') and account['frozen_until'] > datetime.now(account['frozen_until'].tzinfo):
                logger.warning(f"❄️ Account @{sender} is FROZEN.")
                return {"error": "Account frozen"}

            # 🚀 DEPLOY GHOST BROWSER
            account_data = {
                'id': account['id'],
                'username': account['username'],
                'password': account['password'],
                'proxy_host': account['host'],
                'proxy_port': account['port'],
                'proxy_user': account['p_user'],
                'proxy_pass': account['p_pass'],
                'fa_secret': account.get('verification_code'),
                'target_username': username
            }

            result = await browser_engine.run_warming_session(
                account_data,
                self._perform_ghost_analysis
            )

            if result and result.get('success'):
                await db.execute("UPDATE instagram_accounts SET warming_session_count = warming_session_count + 1, last_used_at = NOW() WHERE id = $1", account['id'])
                await self._record_usage(account['id'])
                
                await self._qualify_and_update(lead_id, user_id, 
                                             result['bio'], 
                                             result['followers'], 
                                             result['following'], 
                                             result['full_name'], 
                                             result['posts'],
                                             is_private=result['is_private'])
                
                try:
                   await db.execute("UPDATE instagram_leads SET assigned_account_id = $1, assigned_account_name = $2 WHERE id = $3", account['id'], account['username'], lead_id)
                except: pass

                logger.info(f"🚀 Ghost Analysis Complete: '@{username}' identified via Browser.")
                return {"success": True, "method": f"ghost_browser (@{account['username']})"}
            else:
                raise Exception("Ghost analysis returned no data")
        """

        # Strategy 1 Block Disabled
        """
        except InstagramChallengeException as ce:
            logger.error(f"❄️ CHALLENGE DETECTED: Freezing @{sender} for 36h.")
            await self._freeze_account(account['id'])
            # Don't return, fall through to Strategy 2
        except Exception as e:
            logger.warning(f"⚠️ Ghost account @{sender} failed: {e}. Attempting Anonymous Fallback...")
            # Don't return, fall through to Strategy 2
        """

        # 2. Strategy 2: Anonymous Playwright Extraction (No Account Fallback)
        try:
            logger.info(f"🕶️ Strategy 2: Attempting Anonymous Playwright Capture for @{username}...")
            result = await browser_engine.run_anonymous_session(
                username,
                self._perform_anonymous_analysis
            )

            if result and result.get('success'):
                new_status = await self._qualify_and_update(lead_id, user_id, 
                                                         result['bio'], 
                                                         result['followers'], 
                                                         result['following'], 
                                                         result['full_name'], 
                                                         result['posts'],
                                                         is_private=result['is_private'])
                
                logger.info(f"✨ Anonymous Capture successful for @{username}!")
                return {"success": True, "new_status": new_status, "source": "anonymous_playwright"}
            
            # 🚨 HARD ABORT: If AnonyIG says not found or fails, don't try Fallbacks!
            logger.warning(f"🚫 Profile @{username} analysis failed or not found. Aborting.")
            await db.execute("UPDATE instagram_leads SET status = 'error', updated_at = NOW() WHERE id = $1", lead_id)
            return {"error": "Analysis Failed", "status": "error"}

        except Exception as e:
            logger.error(f"⚠️ Strategy 2 (Anonymous) CRITICAL failure for @{username}: {e}")
            await db.execute("UPDATE instagram_leads SET status = 'error', updated_at = NOW() WHERE id = $1", lead_id)
            return {"error": str(e), "status": "error"}

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
            # Parse JSON fields for frontend consumption
            try:
                d['recent_posts'] = json.loads(d.get('recent_posts') or '[]')
            except:
                d['recent_posts'] = []
                
            try:
                audit = json.loads(d.get('data_audit_json') or '{}') if isinstance(d.get('data_audit_json'), str) else (d.get('data_audit_json') or {})
                d['data_audit_json'] = audit
                # 🏎️ UI Sync: Map the AI Vision reason to the primary rejection_reason field
                d['rejection_reason'] = audit.get('vision_reason', '')
            except:
                d['data_audit_json'] = {}
                d['rejection_reason'] = ''
                
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
        
        return results

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
        
        for line in lines:
            line = line.strip()
            if not line: continue
            
            try:
                # Detect Separator (| or :)
                sep = '|' if '|' in line else ':'
                parts = line.split(sep)
                
                if len(parts) < 2: 
                    results["failed"] += 1
                    continue
                
                username = parts[0].strip().lstrip('@')
                password = parts[1].strip()
                
                fa_secret = None
                session_id = None
                
                # Warmer Logic: Extract 2FA and Cookies
                for p_idx, p in enumerate(parts[2:]):
                    p = p.strip()
                    if not p: continue
                    
                    if 'sessionid=' in p:
                        match = re.search(r'sessionid=([^; ]+)', p)
                        if match: session_id = match.group(1)
                    elif p_idx == 0 and p.isalnum() and len(p) >= 16:
                        # First extra field that is alphanumeric and 16+ chars = 2FA Secret
                        fa_secret = p
                    elif 'x-mid=' in p or 'ig-u-rur=' in p:
                        # Cookie string - extract session ID from it
                        match = re.search(r'sessionid=([^;|\s]+)', p)
                        if match: session_id = match.group(1)

                if not username or not password:
                    results["failed"] += 1
                    continue

                await db.execute("""
                    INSERT INTO instagram_accounts (user_id, username, password, proxy_id, session_id, verification_code, status) 
                    VALUES ($1, $2, $3, $4, $5, $6, 'active')
                    ON CONFLICT (username) DO UPDATE SET
                        password = EXCLUDED.password,
                        proxy_id = COALESCE(EXCLUDED.proxy_id, instagram_accounts.proxy_id),
                        session_id = COALESCE(EXCLUDED.session_id, instagram_accounts.session_id),
                        verification_code = COALESCE(EXCLUDED.verification_code, instagram_accounts.verification_code),
                        status = 'active',
                        updated_at = NOW()
                """, user_id, username, password, proxy_id, session_id, fa_secret)
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
            await db.execute("""
                ALTER TABLE instagram_accounts 
                  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP,
                  ADD COLUMN IF NOT EXISTS session_id TEXT,
                  ADD COLUMN IF NOT EXISTS verification_code TEXT,
                  ADD COLUMN IF NOT EXISTS settings_dump JSONB,
                  ADD COLUMN IF NOT EXISTS frozen_until TIMESTAMP,
                  ADD COLUMN IF NOT EXISTS daily_usage_count INTEGER DEFAULT 0,
                  ADD COLUMN IF NOT EXISTS last_usage_reset TIMESTAMP DEFAULT NOW(),
                  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
            """)
        except Exception as e:
            logger.warning(f"Settings table init: {e}")

    async def get_filter_settings(self, user_id: int):
        row = await db.fetchrow("SELECT * FROM instagram_filter_settings WHERE user_id = $1", user_id)
        if row:
            res = dict(row)
            res['sample_hashes'] = json.loads(res.get('sample_hashes') or '[]')
            return res
        return {"user_id": user_id, "bio_keywords": "", "min_followers": 0, "max_followers": 0, "sample_hashes": [], "visual_niche": ""}

    async def save_filter_settings(self, user_id: int, bio_keywords: str, min_followers: int, max_followers: int, sample_hashes: List[str] = None, visual_niche: str = ""):
        h_json = json.dumps(sample_hashes or [])
        await db.execute("""
            INSERT INTO instagram_filter_settings (user_id, bio_keywords, min_followers, max_followers, sample_hashes, visual_niche, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (user_id) DO UPDATE
            SET bio_keywords = $2, min_followers = $3, max_followers = $4, sample_hashes = $5, visual_niche = $6, updated_at = NOW()
        """, user_id, bio_keywords, min_followers, max_followers, h_json, visual_niche)
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
                
                # No inter-lead nap: move immediately to next lead
                
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
                if len(v_code_raw) > 10:
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

    async def _perform_anonymous_analysis(self, page, account_data):
        """Playwright scraper using AnonyIG/Picuki — No login, reliable data."""
        target_username = account_data['target_username']

        # ─── STRATEGY A: AnonyIG (Search-based, shows everything) ───
        try:
            logger.info(f"🔍 Trying AnonyIG for @{target_username}...")
            await page.goto("https://anonyig.com/en/instagram-profile-viewer/", wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(random.randint(2000, 3000))

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

                logger.info(f"⏳ Waiting for AnonyIG to load @{target_username}...")
                
                # --- STEP 0: NOT FOUND CHECK ---
                await page.wait_for_timeout(6000) # Increased wait for full page load
                not_found_detected = await page.evaluate("""() => {
                    const text = document.body.innerText.toLowerCase();
                    return text.includes('user not found') || 
                           text.includes('profile not found') || 
                           text.includes('not found') ||
                           text.includes('something went wrong') ||
                           text.includes('entered an incorrect link');
                }""")
                if not_found_detected:
                    logger.warning(f"🚫 @{target_username} NOT FOUND on AnonyIG. Marking as error.")
                    return {"success": False, "error_type": "not_found"}

                await page.wait_for_timeout(2000)

                # ── STEP 1: Read the profile header with RETRIES for data population ──
                logger.info(f"👁️ Reading profile header for @{target_username} carefully...")
                
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

                # ── STEP 3: Public Account — Scroll for Posts ──
                logger.info(f"✅ @{target_username} is PUBLIC — scrolling to posts...")
                for _ in range(5):
                    await page.mouse.wheel(0, random.randint(300, 500))
                    await asyncio.sleep(random.uniform(1.2, 2.0))
                
                await page.wait_for_timeout(3000)

                # ── STEP 4: Extract Posts ──
                profile_img_src = await page.evaluate("""() =>
                    document.querySelector('img.profile-pic, img.avatar, .profile-image img, .user-avatar img')?.src || ""
                """)

                posts_data = await page.evaluate(f"""() => {{
                    const posts = [];
                    const seenUrls = new Set();
                    const profileImgSrc = "{profile_img_src}";

                    const imgSelectors = [
                        '.post img', '.media img', '.grid img',
                        'article img', '.item img',
                        '[class*="post"] img', '[class*="media"] img',
                        'img[src*="cdninstagram"]'
                    ];

                    for (const sel of imgSelectors) {{
                        document.querySelectorAll(sel).forEach(img => {{
                            if (posts.length >= 3) return;
                            if (!img.src || seenUrls.has(img.src)) return;
                            if (img.src === profileImgSrc) return;
                            if (img.naturalWidth < 100 || img.naturalHeight < 100) return;
                            
                            const parent = img.closest('[class*="post"], article, [class*="media"], li');
                            if (parent && parent.querySelector('video, [class*="video"], svg[aria-label*="Video"]')) return;
                            
                            posts.push({{ display_url: img.src, caption: "" }});
                            seenUrls.add(img.src);
                        }});
                        if (posts.length >= 3) break;
                    }}
                    return posts;
                }}""")

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

    async def _perform_easycomment_harvest(self, page, account_data):
        """Anonymous harvest via InstaCognito."""
        target_username = account_data['target_username']
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

instagram_service = InstagramService()
