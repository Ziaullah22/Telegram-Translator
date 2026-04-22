import asyncio
import random
import time
import logging
from playwright.async_api import async_playwright
from typing import Callable, Any

logger = logging.getLogger(__name__)

class InstagramBrowserEngine:
    def __init__(self):
        self.pw = None
        self.browser = None

    async def run_warming_session(self, account_data: dict, action_func: Callable):
        """
        Launches a high-fidelity mobile browser session for Instagram.
        """
        async with async_playwright() as p:
            # 1. Setup Proxy
            proxy = None
            if account_data.get('proxy_host'):
                proxy = {
                    "server": f"http://{account_data['proxy_host']}:{account_data['proxy_port']}",
                    "username": account_data.get('proxy_user'),
                    "password": account_data.get('proxy_pass'),
                }

            # 2. Launch Browser (Full Screen Maximized for better rendering)
            browser = await p.chromium.launch(
                headless=False,
                proxy=proxy,
                args=[
                    '--start-maximized',
                    '--disable-blink-features=AutomationControlled',
                    '--use-fake-ui-for-media-stream',
                    '--use-fake-device-for-media-stream',
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--no-sandbox',
                    '--disable-extensions',
                    '--window-state=minimized'
                ]
            )

            # 3. Create Mobile Context (iPhone 15 Pro Identity with Session Memory)
            import os
            sessions_dir = "browser_sessions"
            if not os.path.exists(sessions_dir):
                os.makedirs(sessions_dir)
            
            storage_path = os.path.join(sessions_dir, f"session_{account_data['username']}.json")
            
            context_args = {
                "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
                "viewport": {'width': 393, 'height': 852},
                "device_scale_factor": 1,
                "is_mobile": True,
                "has_touch": True,
                "permissions": ['geolocation', 'notifications']
            }
            
            if os.path.exists(storage_path):
                logger.info(f"🍪 Memory Recall: Loading session cookies for @{account_data['username']}...")
                context_args["storage_state"] = storage_path
            
            context = await browser.new_context(**context_args)

            # 🛡️ STEALTH INIT SCRIPT (Hardware Cloaking)
            bat_level = round(random.uniform(0.15, 0.95), 2)
            is_charging = random.choice([True, False])
            
            await context.add_init_script(f"""(() => {{
                // 1. Hide WebDriver & Spec Alignment
                Object.defineProperty(navigator, 'webdriver', {{ get: () => undefined }});
                Object.defineProperty(navigator, 'hardwareConcurrency', {{ get: () => 6 }});
                Object.defineProperty(navigator, 'deviceMemory', {{ get: () => 8 }});
                
                window.isBotActing = false; // 🤖 BOT FLAG

                // 2. LIVE Battery Spoofing
                let currentLevel = {bat_level};
                const isCharging = {str(is_charging).lower()};
                const batteryObj = {{
                    charging: isCharging,
                    chargingTime: 0,
                    dischargingTime: Infinity,
                    level: currentLevel,
                    addEventListener: () => {{}},
                    removeEventListener: () => {{}}
                }};
                navigator.getBattery = () => Promise.resolve(batteryObj);

                // ☄️ GHOST THUMB: UNSTOPPABLE VISUAL SYSTEM
                const pulseCSS = `
                    @keyframes ripple {{
                        0% {{ transform: scale(1); opacity: 0.8; }}
                        100% {{ transform: scale(3); opacity: 0; }}
                    }}
                    .ghost-click {{
                        position: fixed !important;
                        width: 25px !important;
                        height: 25px !important;
                        border-radius: 50% !important;
                        background: rgba(255, 69, 0, 0.5) !important;
                        pointer-events: none !important;
                        z-index: 2147483647 !important;
                        animation: ripple 0.5s ease-out forwards !important;
                    }}
                    #ghost-cursor {{
                        position: fixed !important;
                        width: 18px !important;
                        height: 18px !important;
                        border: 2px solid #fff !important;
                        border-radius: 50% !important;
                        background-color: #ff4500 !important;
                        box-shadow: 0 0 15px #ff4500 !important;
                        z-index: 2147483647 !important;
                        pointer-events: none !important;
                        left: -100px;
                        top: -100px;
                        display: block !important;
                        visibility: visible !important;
                        opacity: 1 !important;
                    }}
                    #ghost-cursor.active {{ transform: scale(0.7) !important; background-color: #ff8c00 !important; }}
                `;
                const style = document.createElement('style');
                style.innerHTML = pulseCSS;
                document.documentElement.appendChild(style);

                const cursor = document.createElement('div');
                cursor.id = 'ghost-cursor';
                document.documentElement.appendChild(cursor);

                window.mouseX = 0;
                window.mouseY = 0;

                const updateLoop = () => {{
                    cursor.style.setProperty('left', (window.mouseX - 9) + 'px', 'important');
                    cursor.style.setProperty('top', (window.mouseY - 9) + 'px', 'important');
                    requestAnimationFrame(updateLoop);
                }};
                updateLoop();

                document.addEventListener('mousemove', (e) => {{
                    window.mouseX = e.clientX;
                    window.mouseY = e.clientY;
                }}, true);

                document.addEventListener('mousedown', (e) => {{
                    cursor.classList.add('active');
                    const ripple = document.createElement('div');
                    ripple.className = 'ghost-click';
                    ripple.style.setProperty('left', (e.clientX - 12.5) + 'px', 'important');
                    ripple.style.setProperty('top', (e.clientY - 12.5) + 'px', 'important');
                    document.documentElement.appendChild(ripple);
                    setTimeout(() => ripple.remove(), 500);
                    if (!window.isBotActing) window.lastUserActivity = Date.now(); 
                }}, true);

                document.addEventListener('mouseup', () => {{
                    cursor.classList.remove('active');
                }}, true);

                setInterval(() => {{
                    if (isCharging && currentLevel < 1.0) currentLevel += 0.005;
                    else if (!isCharging && currentLevel > 0.05) currentLevel -= 0.003;
                    batteryObj.level = currentLevel;
                }}, 60000);

                // 3. WebGL / GPU Spoofing (Matches iPhone Identity)
                const getParameter = WebGLRenderingContext.prototype.getParameter;
                WebGLRenderingContext.prototype.getParameter = function(parameter) {{
                    if (parameter === 37446) return 'Apple GPU'; // RENDERER
                    if (parameter === 37445) return 'Apple Inc.'; // VENDOR
                    return getParameter.apply(this, arguments);
                }};

                // 4. Mobile Overrides
                Object.defineProperty(navigator, 'maxTouchPoints', {{ get: () => 5 }});
                Object.defineProperty(navigator, 'platform', {{ get: () => 'iPhone' }});
                Object.defineProperty(screen, 'orientation', {{ get: () => ({{ type: 'portrait-primary', angle: 0 }}) }});
                
                window.navigator.chrome = {{ runtime: {{}} }};
                Object.defineProperty(navigator, 'plugins', {{ get: () => [] }});
                Object.defineProperty(navigator, 'languages', {{ get: () => ['en-US', 'en'] }});
            }})();
""")

            page = await context.new_page()
            
            # 🚀 Session Execute
            try:
                result = await action_func(page, account_data)
                # 💾 SAVE MEMORY: Capture all cookies/sessions for next time
                await context.storage_state(path=storage_path)
                logger.info(f"💾 Memory Saved: Session cookies updated for @{account_data['username']}")
                return result
            finally:
                await browser.close()

    async def run_anonymous_session(self, target_username: str, action_func: Callable, is_desktop: bool = False, proxy: dict = None):
        """
        Launches a headful browser to visit Instagram ANONYMOUSLY (No Login).
        """
        async with async_playwright() as p:
            # 1. Setup Proxy
            playwright_proxy = None
            if proxy and proxy.get('host'):
                playwright_proxy = {
                    "server": f"http://{proxy['host']}:{proxy['port']}",
                    "username": proxy.get('p_user'),
                    "password": proxy.get('p_pass'),
                }

            # 2. Launch Browser
            browser = await p.chromium.launch(
                headless=False,
                proxy=playwright_proxy,
                args=[
                    '--start-maximized', 
                    '--disable-blink-features=AutomationControlled',
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--no-sandbox',
                    '--disable-extensions',
                    '--window-state=minimized'
                ]
            )

            # 2. Context based on device type
            if is_desktop:
                context = await browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    viewport={'width': 1920, 'height': 1080}
                )
            else:
                context = await browser.new_context(
                    user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
                    viewport={'width': 393, 'height': 852},
                    is_mobile=True,
                    has_touch=True
                )

            page = await context.new_page()
            
            try:
                result = await action_func(page, {'target_username': target_username})
                return result
            except Exception as e:
                logger.error(f"Anonymous session error: {e}")
                return {"success": False}
            finally:
                await browser.close()

browser_engine = InstagramBrowserEngine()
