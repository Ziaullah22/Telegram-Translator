import asyncio
import re
import httpx
import logging
from patchright.async_api import async_playwright

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("CaptchaTester")

# Configuration
API_KEY = "cfe5eb8b039d9ea6e54a9287b34e5274"
PROXY = {
    "server": "http://p.webshare.io:80",
    "username": "ycliqgkd-rotate",
    "password": "rjhk9bjmss2f"
}
SEARCH_URL = "https://www.google.com/search?q=paint+correction+specialist+site:instagram.com"

async def solve_recaptcha(page, sitekey, url):
    logger.info(f"📤 Sending CAPTCHA request to 2Captcha (Sitekey: {sitekey})...")
    async with httpx.AsyncClient() as client:
        # Step 1: Submit to 2captcha
        submit_url = "https://2captcha.com/in.php"
        data = {
            "key": API_KEY,
            "method": "userrecaptcha",
            "googlekey": sitekey,
            "pageurl": url,
            "json": 1
        }
        res = await client.post(submit_url, data=data, timeout=20)
        res_json = res.json()
        
        if res_json.get("status") != 1:
            logger.error(f"❌ 2Captcha submit failed: {res_json}")
            return None
            
        request_id = res_json.get("request")
        logger.info(f"📥 CAPTCHA submitted successfully. Request ID: {request_id}. Polling for answer...")
        
        # Step 2: Poll for solution
        poll_url = f"https://2captcha.com/res.php?key={API_KEY}&action=get&id={request_id}&json=1"
        for attempt in range(36): # Poll for up to 3 minutes
            await asyncio.sleep(5)
            poll_res = await client.get(poll_url, timeout=20)
            poll_json = poll_res.json()
            
            if poll_json.get("status") == 1:
                token = poll_json.get("request")
                logger.info("✅ 2Captcha solved the CAPTCHA successfully!")
                return token
            elif poll_json.get("request") == "CAPCHA_NOT_READY":
                logger.info(f"⏳ CAPTCHA not ready yet (Attempt {attempt+1}/24)...")
            else:
                logger.error(f"❌ 2Captcha polling error: {poll_json}")
                return None
                
    logger.error("❌ CAPTCHA solving timed out.")
    return None

async def main():
    async with async_playwright() as p:
        logger.info("🖥️ Launching Chromium browser...")
        browser = await p.chromium.launch(
            headless=False,
            channel="chrome",
            proxy=PROXY
        )
        context = await browser.new_context(
            no_viewport=True,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        logger.info(f"🌐 Navigating to Google Search: {SEARCH_URL}")
        try:
            await page.goto(SEARCH_URL, wait_until="load", timeout=45000)
        except Exception as e:
            logger.warning(f"⚠️ Goto timed out or had issue: {e}")
        
        # Settle sleep
        logger.info("⏳ Sleep 15s to let redirect loops complete...")
        await asyncio.sleep(15)
        
        content = ""
        for attempt in range(10):
            try:
                content = await page.content()
                if content:
                    break
            except Exception as e:
                logger.warning(f"⚠️ Failed to get content (attempt {attempt+1}): {e}")
                await asyncio.sleep(3)
                
        if not content:
            logger.error("❌ Failed to retrieve page content after retries.")
            await browser.close()
            return
        
        # Check if CAPTCHA / Unusual Traffic page is visible
        if "unusual traffic" in content.lower() or "captcha" in content.lower() or "g-recaptcha" in content.lower():
            logger.warning("🚨 CAPTCHA detected on page!")
            
            # Find sitekey
            sitekey = None
            
            # Method 1: Look in elements
            recaptcha_element = await page.query_selector(".g-recaptcha")
            if recaptcha_element:
                sitekey = await recaptcha_element.get_attribute("data-sitekey")
                
            # Method 2: Look in page source regex
            if not sitekey:
                matches = re.findall(r'data-sitekey=["\']([a-zA-Z0-9_-]+)["\']', content)
                if matches:
                    sitekey = matches[0]
                    
            if not sitekey:
                # Check iframe source
                iframes = page.frames
                for frame in iframes:
                    frame_url = frame.url
                    match = re.search(r'k=([a-zA-Z0-9_-]+)', frame_url)
                    if match:
                        sitekey = match.group(1)
                        break
            
            if sitekey:
                logger.info(f"🎯 Found ReCAPTCHA sitekey: {sitekey}")
                
                # Inspect DOM structure of captcha elements
                logger.info("🔍 Inspecting DOM structure of captcha page forms...")
                form_info = await page.evaluate("""() => {
                    const forms = Array.from(document.querySelectorAll('form'));
                    return forms.map(f => ({
                        id: f.id,
                        action: f.action,
                        method: f.method,
                        inputs: Array.from(f.querySelectorAll('input, textarea')).map(i => ({
                            name: i.name,
                            type: i.type,
                            id: i.id,
                            value: i.value ? i.value.substring(0, 50) : ''
                        }))
                    }));
                }""")
                logger.info(f"📋 Form structure: {form_info}")
                
                token = await solve_recaptcha(page, sitekey, page.url)
                if token:
                    # Inject token into response field
                    logger.info("💉 Injecting solver token into page...")
                    await page.evaluate(f"""
                        const ta = document.getElementById('g-recaptcha-response') || document.querySelector('[name="g-recaptcha-response"]');
                        if (ta) {{
                            ta.innerHTML = '{token}';
                            ta.value = '{token}';
                        }} else {{
                            console.error('Textarea g-recaptcha-response not found!');
                        }}
                    """)
                    
                    # Submit the form or run callback
                    logger.info("📤 Triggering submit callback or form submission...")
                    await page.evaluate(f"""
                        const token = '{token}';
                        
                        // 1. Injected directly into the form fields
                        const ta = document.getElementById('g-recaptcha-response') || document.querySelector('[name="g-recaptcha-response"]');
                        if (ta) {{
                            ta.innerHTML = token;
                            ta.value = token;
                        }}
                        
                        // 2. Locate and invoke Google's ReCAPTCHA callbacks dynamically
                        let callbackTriggered = false;
                        if (window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients) {{
                            for (const clientId in window.___grecaptcha_cfg.clients) {{
                                const client = window.___grecaptcha_cfg.clients[clientId];
                                for (const key in client) {{
                                    if (client[key] && typeof client[key].callback === 'function') {{
                                        client[key].callback(token);
                                        callbackTriggered = true;
                                    }}
                                    if (client[key] && client[key].promise && typeof client[key].promise.then === 'function') {{
                                        // If using promises
                                        client[key].callback(token);
                                        callbackTriggered = true;
                                    }}
                                }}
                            }}
                        }}
                        
                        // 3. Fallback: Submit form natively
                        if (!callbackTriggered) {{
                            const form = document.getElementById('captcha-form') || document.querySelector('form');
                            if (form) {{
                                HTMLFormElement.prototype.submit.call(form);
                            }}
                        }}
                    """)
                    
                    # Wait 5 seconds to see if callback triggered navigation automatically
                    await asyncio.sleep(5)
                    
                    # 4. Secondary fallback: Submit form via POST using playwright button click or form submission
                    post_content_check = await page.content()
                    if "unusual traffic" in post_content_check.lower():
                        logger.info("🖱️ Form not submitted by callback, executing HTMLFormElement submit...")
                        await page.evaluate("""
                            const form = document.getElementById('captcha-form') || document.querySelector('form');
                            if (form) {
                                HTMLFormElement.prototype.submit.call(form);
                            }
                        """)
                    
                    logger.info("⏳ Waiting for page to load post-captcha...")
                    await asyncio.sleep(12)
                    
                    post_content = await page.content()
                    if "unusual traffic" not in post_content.lower():
                        logger.info("🎉 SUCCESS! CAPTCHA solved and bypassed.")
                    else:
                        logger.error("❌ Submitted token but still stuck on CAPTCHA page.")
            else:
                logger.error("❌ Could not extract sitekey from the captcha page.")
        else:
            logger.info("✅ No CAPTCHA triggered. Loaded search page directly!")
            
        # Keep open for a bit to inspect visually
        logger.info("🚪 Keeping browser open for 15 seconds before close...")
        await asyncio.sleep(15)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
