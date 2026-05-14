import asyncio
import logging
import os
import random
import sys
from typing import Dict, Any
from playwright.async_api import async_playwright, Browser, BrowserContext, Page

# Windows-only imports
if sys.platform == "win32":
    import ctypes
    from ctypes import wintypes
    SW_HIDE = 0
    SW_SHOW = 5
    GWL_EXSTYLE = -20
    WS_EX_TOOLWINDOW = 0x00000080
    WS_EX_APPWINDOW = 0x00040000
    SWP_HIDEWINDOW = 0x0080
    SWP_SHOWWINDOW = 0x0040


logger = logging.getLogger(__name__)

class InstagramSessionManager:
    """
    Manages persistent, VISIBLE browser sessions for Instagram accounts.
    One browser per account — Connect minimizes it, View un-minimizes it.
    Uses CDP (Chrome DevTools Protocol) to control window visibility.
    """
    def __init__(self):
        self.active_sessions: Dict[int, Dict[str, Any]] = {} # account_id -> {browser, context, page, p_instance, window_id, browser_cdp}

    async def connect(self, account_id: int, account_data: dict, headless: bool = False):
        """
        Launches a browser for the account and injects cookies.
        """
        if account_id in self.active_sessions:
            logger.info(f"Session already active for account {account_id}")
            return {"status": "already_connected"}

        p_instance = await async_playwright().start()
        
        # 1. Setup Proxy
        proxy = None
        
        # Priority 1: Manual proxy string on the account
        manual_proxy_str = account_data.get('proxy')
        if manual_proxy_str:
            from instagram_service import InstagramService
            svc = InstagramService()
            p_data = svc._parse_proxy_str(manual_proxy_str)
            if p_data:
                p_auth = f"{p_data['user']}:{p_data['pass']}@" if p_data['user'] else ""
                proxy = {
                    "server": f"http://{p_data['host']}:{p_data['port']}",
                    "username": p_data['user'],
                    "password": p_data['pass'],
                }
                logger.info(f"🛰️ Using manual proxy for account {account_id}: {p_data['host']}")

        # Priority 2: Linked proxy from pool
        if not proxy and account_data.get('proxy_host'):
            proxy = {
                "server": f"http://{account_data['proxy_host']}:{account_data['proxy_port']}",
                "username": account_data.get('proxy_user'),
                "password": account_data.get('proxy_pass'),
            }
            logger.info(f"🛡️ Using pool proxy for account {account_id}: {account_data['proxy_host']}")

        # 2. Launch Browser — VISIBLE (headless=False)
        # We start it off-screen (-10000, -10000) so it never flashes on your screen
        browser = await p_instance.chromium.launch(
            headless=headless,
            proxy=proxy,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-first-run',
                '--no-default-browser-check',
                '--no-sandbox',
                '--window-position=100,50',
                '--window-size=420,800'
            ]
        )

        # 3. Setup Context
        context_args = {
            "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
            "viewport": {'width': 393, 'height': 852},
            "is_mobile": True,
            "has_touch": True,
            "permissions": ['geolocation', 'notifications'],
            "ignore_https_errors": True,
            "proxy": proxy
        }
        
        # 📂 PERSISTENT SESSION: Load storage state from DB if available
        import json
        if account_data.get('full_cookies_json'):
            try:
                state_data = json.loads(account_data['full_cookies_json'])
                # Check if it's a Playwright storage state (has 'cookies' or 'origins')
                if isinstance(state_data, dict) and ('cookies' in state_data or 'origins' in state_data):
                    context_args["storage_state"] = state_data
            except: pass
        
        context = await browser.new_context(**context_args)
        page = await context.new_page()

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

        # 👻 GHOST TITLE: Set a unique secret title so we can find this window on Windows
        secret_title = f"GHOST_IG_{account_id}_{random.randint(1000, 9999)}"
        await page.evaluate(f"document.title = '{secret_title}'")
        
        # Store session
        self.active_sessions[account_id] = {
            "browser": browser,
            "context": context,
            "page": page,
            "p_instance": p_instance,
            "window_id": None,
            "browser_cdp": None,
            "is_hidden": False,
            "secret_title": secret_title
        }

        # 🧹 CLEANUP: If browser is closed (manually or crash), remove from active_sessions
        def on_disconnect():
            logger.info(f"🛑 Browser disconnected for account {account_id}. Cleaning up session.")
            self.active_sessions.pop(account_id, None)
        
        browser.on("disconnected", on_disconnect)

        # 🪟 Get CDP window handle so we can show/hide later
        try:
            browser_cdp = await browser.new_browser_cdp_session()
            page_cdp = await context.new_cdp_session(page)
            target_info = await page_cdp.send('Target.getTargetInfo')
            target_id = target_info['targetInfo']['targetId']
            window_info = await browser_cdp.send('Browser.getWindowForTarget', {'targetId': target_id})
            self.active_sessions[account_id]['window_id'] = window_info['windowId']
            self.active_sessions[account_id]['browser_cdp'] = browser_cdp
            logger.info(f"🪟 CDP window handle acquired (windowId={window_info['windowId']})")
        except Exception as e:
            logger.warning(f"⚠️ CDP window handle failed (hide/show won't work): {e}")

        # Navigate to Instagram and login if needed
        try:
            await self._goto_instagram_home_and_login(page, account_data)
            # Restore normal title after navigation
            await page.evaluate("document.title = 'Instagram'")
        except Exception as e:
            logger.error(f"Login logic check failed: {e}")
            
        # 💾 SYNC SESSION TO DB
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

        # 🙈 If background mode (headless=True), deep-hide window after login
        if headless:
            await self.hide_window(account_id)
            logger.info(f"👤 Window DEEP HIDDEN for account {account_id} (background mode)")
        
        return {"status": "connected"}

    async def show_window(self, account_id: int):
        """Un-hide and bring the browser window to front (Windows only)."""
        if sys.platform != "win32": return
        
        session = self.active_sessions.get(account_id)
        if not session: return
        
        try:
            # 1. Use Windows API to Show + Restore Styles
            hwnds = self._get_window_handles(account_id, session.get('secret_title'))
            if not hwnds: # Fallback: try finding by "Instagram" title
                hwnds = self._get_window_handles(account_id, "Instagram")

            for hwnd in hwnds:
                # Restore 'App Window' style so it shows in taskbar again
                style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
                style = (style & ~WS_EX_TOOLWINDOW) | WS_EX_APPWINDOW
                ctypes.windll.user32.SetWindowLongW(hwnd, GWL_EXSTYLE, style)
                
                # Move window back to visible area and show
                ctypes.windll.user32.SetWindowPos(hwnd, 0, 100, 50, 420, 800, SWP_SHOWWINDOW)
                ctypes.windll.user32.ShowWindow(hwnd, SW_SHOW)
                ctypes.windll.user32.SetForegroundWindow(hwnd)
            
            logger.info(f"✨ Window RESTORED for account {account_id}")

            # 2. Use CDP as backup
            browser_cdp = session.get('browser_cdp')
            window_id = session.get('window_id')
            if browser_cdp and window_id:
                await browser_cdp.send('Browser.setWindowBounds', {
                    'windowId': window_id,
                    'bounds': {'windowState': 'normal', 'left': 100, 'top': 50, 'width': 420, 'height': 800}
                })
            
            session['is_hidden'] = False
            await session['page'].bring_to_front()
        except Exception as e:
            logger.warning(f"⚠️ Could not show window: {e}")

    async def hide_window(self, account_id: int):
        """Hide the browser window completely (Windows only)."""
        if sys.platform != "win32": 
            # On Linux, we are already headless, so just mark as hidden
            session = self.active_sessions.get(account_id)
            if session: session['is_hidden'] = True
            return

        session = self.active_sessions.get(account_id)
        if not session: return
        
        # We try a few times because Chromium windows sometimes take a moment to appear
        for attempt in range(5):
            try:
                # 1. Use Windows API to HIDE + REMOVE FROM TASKBAR
                # We search for the secret title we set during launch
                hwnds = self._get_window_handles(account_id, session.get('secret_title'))
                
                # If we can't find it by secret title, try the default "Instagram" title
                if not hwnds:
                    hwnds = self._get_window_handles(account_id, "Instagram")

                if hwnds:
                    for hwnd in hwnds:
                        # Set 'Tool Window' style to hide from taskbar
                        style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
                        if style != 0:
                            style = (style & ~WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW
                            ctypes.windll.user32.SetWindowLongW(hwnd, GWL_EXSTYLE, style)
                        
                        # Move to the void and hide + Refresh Taskbar (SWP_FRAMECHANGED = 0x0020)
                        ctypes.windll.user32.SetWindowPos(hwnd, 0, -10000, -10000, 420, 800, SWP_HIDEWINDOW | 0x0020)
                        ctypes.windll.user32.ShowWindow(hwnd, SW_HIDE)
                    
                    logger.info(f"👤 Window DEEP HIDDEN (Attempt {attempt+1}) for account {account_id}")
                    session['is_hidden'] = True
                    break # Success!
                else:
                    logger.debug(f"Waiting for window to appear (attempt {attempt+1})...")
                    await asyncio.sleep(1) # Wait and try again
            except Exception as e:
                logger.warning(f"⚠️ Hide attempt {attempt+1} failed: {e}")
                await asyncio.sleep(1)

        # 2. Use CDP as backup to move bounds off-screen
        try:
            browser_cdp = session.get('browser_cdp')
            window_id = session.get('window_id')
            if browser_cdp and window_id:
                await browser_cdp.send('Browser.setWindowBounds', {
                    'windowId': window_id,
                    'bounds': {'windowState': 'normal', 'left': -10000, 'top': -10000, 'width': 420, 'height': 800}
                })
        except: pass

    def _get_window_handles(self, account_id: int, title_match: str = None):
        """Find Windows HWND handles by matching the window title (Windows only)."""
        if sys.platform != "win32" or not title_match: return []
        try:
            # Note: We must use a set to collect unique results via the callback
            results_set = set()

            def callback(hwnd, lParam):
                # Correctly cast the lParam back to a Python set
                results = ctypes.cast(lParam, ctypes.py_object).value
                
                title_buf = ctypes.create_unicode_buffer(1024)
                ctypes.windll.user32.GetWindowTextW(hwnd, title_buf, 1024)
                
                if title_match in title_buf.value:
                    # Find the absolute ROOT window
                    root = ctypes.windll.user32.GetAncestor(hwnd, 2)
                    if root: results.add(root)
                    
                    # Find the OWNER window (Taskbar icons often belong to the owner)
                    owner = ctypes.windll.user32.GetWindow(hwnd, 4) # GW_OWNER = 4
                    if owner: results.add(owner)
                    
                    results.add(hwnd)
                return True

            WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
            # Pass results_set directly as py_object
            ctypes.windll.user32.EnumWindows(WNDENUMPROC(callback), ctypes.py_object(results_set))
            return list(results_set)
        except Exception as e:
            logger.warning(f"Error finding HWNDs: {e}")
            return []


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
        import json

        has_cookies = bool(account_data.get('full_cookies_json') or account_data.get('session_id'))

        if has_cookies:
            # 🍪 COOKIE PATH: Use the login-redirect trick to bypass the mobile splash
            # Navigating to /accounts/login/?next=/ with valid cookies = Instagram auto-redirects to home
            logger.info(f"🍪 Cookies found for @{account_data.get('username')} — using cookie bypass trick...")
            await page.goto("https://www.instagram.com/accounts/login/?next=/", wait_until="domcontentloaded")
            await page.bring_to_front()
            # Give Instagram time to detect cookies and auto-redirect
            await page.wait_for_timeout(5000)

            final_url = page.url
            logger.info(f"   📍 Final URL after cookie check: {final_url}")

            # If we were redirected AWAY from the login/signup pages, cookies worked!
            if '/accounts/login' not in final_url and '/accounts/emailsignup' not in final_url:
                logger.info(f"✅ Cookie login successful for @{account_data.get('username')}! (redirected to {final_url})")
                await self._clear_popups(page)
                return

            # Cookies didn't work → fall back to credential login
            logger.warning(f"⚠️ Cookies did NOT work for @{account_data.get('username')}. Falling back to password login...")


        # 🔑 CREDENTIAL PATH: Go directly to the login page (skips splash/signup screen)
        logger.info(f"🔑 Navigating directly to login page for @{account_data.get('username')}...")
        await page.goto("https://www.instagram.com/accounts/login/", wait_until="domcontentloaded")
        await page.bring_to_front()

        # Wait up to 10s for the username field to actually appear
        try:
            await page.wait_for_selector('input[name="username"]', timeout=10000)
        except:
            logger.error("❌ Login form did not appear after 10s. Instagram may be showing a challenge.")
            return

        user_val = account_data.get('username', '')
        pass_val = account_data.get('password', '')

        if not user_val or not pass_val:
            logger.error(f"❌ No username/password for account {account_data.get('username')}. Cannot auto-login.")
            return

        logger.info(f"🔑 Auto-Login: Typing credentials for @{user_val}...")

        # --- Step 1: Type Username ---
        user_input = await page.query_selector('input[name="username"]')
        if user_input:
            await user_input.click()
            await page.keyboard.press("Control+A")
            await page.keyboard.press("Backspace")
            await self._human_type(page, user_val)
            await asyncio.sleep(random.uniform(0.8, 1.2))

        # --- Step 2: Type Password ---
        pass_input = await page.query_selector('input[name="password"]')
        if pass_input:
            await pass_input.click()
            await self._human_type(page, pass_val)
            await asyncio.sleep(random.uniform(0.8, 1.2))

        # --- Step 3: Click the Login Button ---
        logger.info("🖱️ Clicking the Log In button...")
        await asyncio.sleep(1)  # Let Instagram's JS enable the button

        clicked = False
        for selector in [
            'button[type="submit"]',
            'button:has-text("Log in")',
            'div[role="button"]:has-text("Log in")',
        ]:
            try:
                await page.click(selector, timeout=4000)
                clicked = True
                logger.info(f"✅ Login button clicked via: {selector}")
                break
            except Exception as e:
                logger.warning(f"   ↳ Selector '{selector}' failed: {e}")

        # Wait for page to navigate after login button click
        logger.info("⏳ Waiting for page to navigate after login...")
        try:
            await page.wait_for_url(
                lambda url: '/accounts/login' not in url or '/two_factor' in url or '/challenge' in url,
                timeout=10000
            )
        except:
            pass  # If timeout, just continue with where we are

        # Log where we ended up
        current_url = page.url
        page_title = await page.title()
        logger.info(f"📍 Post-login URL: {current_url} | Title: {page_title}")

        # Dismiss any "Unexpected Error" or "Try again" popups
        try:
            err_ok = await page.query_selector('button:has-text("OK"), button:has-text("Dismiss"), button:has-text("Try again")')
            if err_ok and await err_ok.is_visible():
                logger.warning("⚠️ Detected error popup after login. Dismissing...")
                await err_ok.click()
                await asyncio.sleep(2)
        except: pass

        # --- Step 4: Handle 2FA ---
        # First check by URL (most reliable)
        is_2fa_page = '/two_factor' in current_url or '/challenge' in current_url or 'security_code' in current_url
        logger.info(f"🛡️ Scanning for 2FA checkpoint... (URL-based detected: {is_2fa_page})")
        await page.wait_for_timeout(2000)

        # Then check for 2FA input elements (cast a wide net)
        two_fa = None
        try:
            two_fa = await page.wait_for_selector(
                'input[name="verificationCode"], '
                'input[name="one_time_code"], '
                'input[autocomplete="one-time-code"], '
                'input[aria-label="Security Code"], '
                'input[aria-label*="digit"], '
                'input[aria-label*="code" i], '
                'input[placeholder*="code" i], '
                'input[placeholder*="digit" i], '
                'input[type="number"][maxlength="6"], '
                'input[type="text"][maxlength="6"]',
                timeout=5000
            )
        except:
            pass  # No 2FA input found within 5s

        split_boxes = []
        try:
            split_boxes = await page.query_selector_all(
                'input[autocomplete="one-time-code"], '
                'input[id*="verificationCode"], '
                'input[type="number"][maxlength="1"]'
            )
        except: pass

        fa_secret = account_data.get('two_factor_secret') or account_data.get('verification_code')
        logger.info(f"🔐 2FA status: input_found={two_fa is not None}, split_boxes={len(split_boxes)}, has_secret={bool(fa_secret)}")

        if (two_fa or len(split_boxes) > 0 or is_2fa_page) and fa_secret:
            logger.info("🔐 2FA detected! Auto-filling TOTP code...")
            import pyotp
            try:
                clean_secret = fa_secret.strip().replace(" ", "").upper()
                totp = pyotp.TOTP(clean_secret)
                code = totp.now()
                logger.info(f"🔐 Generated TOTP code: {code}")

                if split_boxes and len(split_boxes) >= 6:
                    # Split-box 2FA (6 individual input boxes)
                    for i, char in enumerate(code):
                        if i < len(split_boxes):
                            await split_boxes[i].click()
                            await split_boxes[i].type(char, delay=120)
                elif two_fa:
                    # Single input field
                    await two_fa.click()
                    await two_fa.fill("")  # Clear first
                    await self._human_type(page, code)
                else:
                    # 2FA page but no input found yet — try clicking any visible input
                    any_input = await page.query_selector('input[type="text"], input[type="number"]')
                    if any_input:
                        await any_input.click()
                        await self._human_type(page, code)

                await asyncio.sleep(1)

                # Click Confirm/Continue/Submit button
                for confirm_sel in [
                    'button:has-text("Confirm")',
                    'button:has-text("Continue")',
                    'button:has-text("Trust")',
                    'button[type="submit"]',
                    'div[role="button"]:has-text("Confirm")',
                ]:
                    try:
                        await page.click(confirm_sel, timeout=3000)
                        logger.info(f"🔐 2FA Confirm clicked via: {confirm_sel}")
                        break
                    except: pass
                else:
                    await page.keyboard.press("Enter")

                await page.wait_for_timeout(5000)
                logger.info("✅ 2FA code submitted!")
            except Exception as e:
                logger.error(f"❌ 2FA Error: {e}")
        elif two_fa or len(split_boxes) > 0 or is_2fa_page:
            logger.warning("⚠️ 2FA page detected but NO secret stored for this account! Manual entry needed.")

        # 🧹 Clear popups
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
