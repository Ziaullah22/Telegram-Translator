import asyncio
import logging
import os
import random
from typing import Dict, Any
from playwright.async_api import async_playwright, Browser, BrowserContext, Page

logger = logging.getLogger(__name__)

class InstagramSessionManager:
    """
    Manages persistent, visible browser sessions for Instagram accounts.
    Allows users to 'Connect' and see the browser window.
    """
    def __init__(self):
        self.active_sessions: Dict[int, Dict[str, Any]] = {} # account_id -> {browser, context, page, p_instance}

    async def connect(self, account_id: int, account_data: dict, headless: bool = True):
        """
        Launches a browser for the account and injects cookies.
        """
        if account_id in self.active_sessions:
            logger.info(f"Session already active for account {account_id}")
            return {"status": "already_connected"}

        p_instance = await async_playwright().start()
        
        # 1. Setup Proxy
        proxy = None
        if account_data.get('proxy_host'):
            proxy = {
                "server": f"http://{account_data['proxy_host']}:{account_data['proxy_port']}",
                "username": account_data.get('proxy_user'),
                "password": account_data.get('proxy_pass'),
            }

        # 2. Launch Browser
        launch_args = [
            '--disable-blink-features=AutomationControlled',
            '--no-first-run',
            '--no-default-browser-check',
            '--no-sandbox'
        ]
        
        if headless:
            launch_args.append('--window-state=minimized')
        else:
            # 📱 POPUP STYLE: Centered mobile-sized window
            launch_args.extend([
                '--window-size=450,850',
                '--window-position=600,50'
            ])

        browser = await p_instance.chromium.launch(
            headless=headless,
            proxy=proxy,
            args=launch_args
        )

        # 3. Setup Context
        context_args = {
            "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
            "viewport": {'width': 393, 'height': 852},
            "is_mobile": True,
            "has_touch": True,
            "permissions": ['geolocation', 'notifications']
        }
        
        # 📂 PERSISTENT SESSION: Load storage state from DB if available
        import json
        if account_data.get('full_cookies_json'):
            try:
                state_data = json.loads(account_data['full_cookies_json'])
                # Check if it's a Playwright storage state (has 'cookies' or 'origins')
                if isinstance(state_data, dict) and ('cookies' in state_data or 'origins' in state_data):
                    context_args["storage_state"] = state_data
                else:
                    # Fallback: if it's just a list of cookies, we'll inject them later
                    pass
            except: pass
        
        context = await browser.new_context(**context_args)

        # 💉 Inject Cookies if provided as a raw list (Legacy Support)
        if account_data.get('full_cookies_json') and "storage_state" not in context_args:
            try:
                raw_cookies = json.loads(account_data['full_cookies_json'])
                if isinstance(raw_cookies, list):
                    cookies_to_inject = []
                    for c in raw_cookies:
                        clean_c = {
                            "name": c.get('name'),
                            "value": c.get('value'),
                            "domain": c.get('domain', '.instagram.com'),
                            "path": c.get('path', '/'),
                            "secure": True
                        }
                        cookies_to_inject.append(clean_c)
                    await context.add_cookies(cookies_to_inject)
            except: pass

        page = await context.new_page()
        
        # Store session
        self.active_sessions[account_id] = {
            "browser": browser,
            "context": context,
            "page": page,
            "p_instance": p_instance
        }

        # Navigate to Instagram and login if needed
        try:
            await self._goto_instagram_home_and_login(page, account_data)
        except Exception as e:
            logger.error(f"Login logic check failed: {e}")
            
        # 💾 SYNC SESSION TO DB: Capture the state now so it survives backend restarts
        try:
            from database import db
            current_state = await context.storage_state()
            await db.execute(
                "UPDATE instagram_accounts SET full_cookies_json = $1, updated_at = NOW() WHERE id = $2",
                json.dumps(current_state), account_id
            )
            logger.info(f"💾 Session state for account {account_id} synced to database.")
        except Exception as e:
            logger.error(f"Failed to sync session to DB: {e}")
        
        return {"status": "connected"}

    async def _human_type(self, page, text: str, delay_range: tuple = (100, 300)):
        """Simulates human typing with variable speed."""
        if not text: return
        for char in text:
            try:
                await page.keyboard.type(char, delay=random.randint(20, 50))
            except:
                await page.keyboard.insert_text(char)
            await asyncio.sleep(random.uniform(delay_range[0] / 1000, delay_range[1] / 1000))

    async def _goto_instagram_home_and_login(self, page: Page, account_data: dict):
        """Shared helper: Go to Instagram home, login if needed, clear popups."""
        await page.goto("https://www.instagram.com/", wait_until="domcontentloaded")
        await page.bring_to_front() # Ensure window is visible
        
        # ⚡ FAST CHECK: Are we already logged in? 
        # Check for icons that only appear when logged in (Direct, Explore, Home, etc.)
        try:
            logged_in_indicator = await page.query_selector('svg[aria-label*="Direct"], svg[aria-label*="Messenger"], div[role="menuitem"], a[href*="/direct/"]')
            if logged_in_indicator:
                logger.info(f"⚡ Fast-Connect: @{account_data.get('username')} is already logged in.")
                await self._clear_popups(page)
                return
        except: pass

        await page.wait_for_timeout(2000) # Quick breath

        # 📱 MOBILE SPLASH SCREEN CHECK: Detect "Log in" link on landing page
        try:
            login_link = await page.query_selector('a:has-text("Log in"), button:has-text("Log in"), span:has-text("Log in")')
            if login_link and await login_link.is_visible():
                logger.info("📱 Detected mobile splash screen. Clicking Log in...")
                await login_link.click()
                await page.wait_for_timeout(random.randint(2000, 3000))
        except: pass

        # Check if login is needed
        user_input = await page.query_selector('input[name="email"], input[name="username"], input[aria-label*="username"]')
        if user_input:
            user_val = account_data.get('username')
            pass_val = account_data.get('password')
            
            if not user_val or not pass_val:
                logger.error(f"Missing credentials for account {account_data.get('username')}")
                return

            logger.info(f"🔑 Auto-Login: @{user_val}")
            await user_input.click()
            await page.keyboard.press("Control+A")
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
                await asyncio.sleep(4)
                
                # Check for "Unexpected Error" popup
                try:
                    err_ok = await page.query_selector('button:has-text("OK"), button:has-text("Dismiss")')
                    if err_ok and await err_ok.is_visible():
                        logger.warning("⚠️ Detected 'Unexpected Error' popup. Dismissing...")
                        await err_ok.click()
                        await asyncio.sleep(2)
                except: pass

                # 🖱️ EXPLICIT CLICK (Mobile Fallback): If still on login page, click the button
                try:
                    is_still_login = await page.query_selector('input[name="password"]')
                    if is_still_login:
                        submit_btn = await page.query_selector('button[type="submit"], button:has-text("Log in"), div[role="button"]:has-text("Log in")')
                        if submit_btn and await submit_btn.is_visible():
                            logger.info("🖱️ Clicking explicit Log In button (Retrying)...")
                            await submit_btn.click()
                            await asyncio.sleep(5)
                except: pass
                
                await page.wait_for_timeout(5000)

            # 🛡️ Handle 2FA if detected (Check for several seconds)
            logger.info("🛡️ Scanning for 2FA checkpoint...")
            await page.wait_for_timeout(5000)
            
            two_fa = await page.query_selector('input[name="verificationCode"], input[aria-label="Security Code"], input[placeholder="Code"], input[aria-label="Code"], input[aria-label*="digit"], input[name="one_time_code"]')
            split_boxes = await page.query_selector_all('input[autocomplete="one-time-code"], input[id*="verificationCode"]')
            
            fa_secret = account_data.get('two_factor_secret') or account_data.get('verification_code')
            
            if (two_fa or (split_boxes and len(split_boxes) > 0)) and fa_secret:
                logger.info("🔐 2FA detected! Attempting auto-fill...")
                import pyotp
                try:
                    clean_secret = fa_secret.strip().replace(" ", "").upper()
                    totp = pyotp.TOTP(clean_secret)
                    code = totp.now()
                    if two_fa:
                        await two_fa.click()
                        await self._human_type(page, code)
                    elif split_boxes:
                        for i, char in enumerate(code):
                            if i < len(split_boxes):
                                await split_boxes[i].click()
                                await split_boxes[i].type(char, delay=100)
                    
                    await asyncio.sleep(1)
                    await page.keyboard.press("Enter")
                    
                    # Try clicking confirm button too
                    confirm_btn = await page.query_selector('button:has-text("Confirm"), button:has-text("Continue"), button:has-text("Trust")')
                    if confirm_btn:
                        await confirm_btn.click()
                    
                    await page.wait_for_timeout(5000)
                except Exception as e:
                    logger.error(f"2FA Error: {e}")

        # 🧹 Clear generic popups (Run this whether we just logged in or were already logged in)
        await self._clear_popups(page)

    async def _clear_popups(self, page):
        """Helper to scan and click common Instagram popups."""
        logger.info("🧹 Scanning for post-login popups...")
        await page.wait_for_timeout(2000)
        
        popup_texts = [
            "Not Now", "Not now", "Allow", "Save Info", "Save info", 
            "Turn On", "Dismiss", "Maybe Later", "Cancel"
        ]
        
        for btn_text in popup_texts:
            try:
                selectors = [
                    f'button:has-text("{btn_text}")',
                    f'div[role="button"]:has-text("{btn_text}")',
                    f'span:has-text("{btn_text}")'
                ]
                for selector in selectors:
                    btn = await page.query_selector(selector)
                    if btn and await btn.is_visible():
                        logger.info(f"   🔘 Clearing popup: {btn_text}")
                        await btn.click()
                        await asyncio.sleep(1.5)
                        break 
            except: pass

    async def disconnect(self, account_id: int):
        """
        Closes the browser session for the account and saves state to DB.
        """
        if account_id not in self.active_sessions:
            return {"status": "not_connected"}
        
        import json
        session = self.active_sessions.pop(account_id)
        try:
            # 💾 FINAL SYNC: Save state to DB before closing
            from database import db
            current_state = await session['context'].storage_state()
            await db.execute(
                "UPDATE instagram_accounts SET full_cookies_json = $1, updated_at = NOW() WHERE id = $2",
                json.dumps(current_state), account_id
            )
            logger.info(f"💾 Final session state for account {account_id} saved to DB.")
            
            await session['browser'].close()
            await session['p_instance'].stop()
        except Exception as e:
            logger.error(f"Error disconnecting account {account_id}: {e}")

        return {"status": "disconnected"}

    def is_connected(self, account_id: int):
        if account_id not in self.active_sessions:
            return False
        
        # 🕵️ DEEP CHECK: Is the browser actually physically open?
        # If the user closed the window manually, this will return False
        try:
            session = self.active_sessions[account_id]
            return session['browser'].is_connected()
        except:
            # Clean up the stale session if it's dead
            self.active_sessions.pop(account_id, None)
            return False

instagram_session_manager = InstagramSessionManager()
