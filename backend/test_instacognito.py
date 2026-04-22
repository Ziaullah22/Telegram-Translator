import asyncio
from playwright.async_api import async_playwright
import random
import time

async def test_instacognito():
    target_username = "ziaullah_khaan"
    url = "https://instacognito.com/en/followed"
    
    async with async_playwright() as p:
        print(f"Launching browser for @{target_username}...")
        browser = await p.chromium.launch(headless=False)
        
        # Mobile Context
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
            viewport={'width': 393, 'height': 852},
            is_mobile=True,
            has_touch=True
        )
        
        page = await context.new_page()
        
        print(f"Navigating to {url}...")
        await page.goto(url, wait_until="domcontentloaded")
        await asyncio.sleep(5)
        
        # 1. Search Username
        print(f"Typing username: {target_username}")
        search_input = await page.wait_for_selector('input[type="text"]', timeout=10000)
        await search_input.click()
        for char in target_username:
            await search_input.type(char, delay=random.randint(50, 100))
        
        print("Clicking Search...")
        await page.keyboard.press("Enter")
        
        # 2. Wait for Profile and click Followers (Red Dot)
        print("Waiting for profile page to load...")
        try:
            await page.wait_for_selector('text="Followers"', timeout=30000)
        except:
            print("Timeout waiting for 'Followers' text, but checking anyway...")
        
        await asyncio.sleep(3)
        
        print("Attempting to click the Followers Red Dot area...")
        clicked = await page.evaluate("""() => {
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
        print(f"Click status: {clicked}")
        
        await asyncio.sleep(5)
        
        # 3. Slow Scroll and Harvest
        print("Starting slow scroll harvest...")
        usernames = set()
        consecutive_no_new = 0
        
        for i in range(50): # Max 50 steps
            # --- Universal Username Extractor ---
            # This captures any text that looks like a username in the list
            current_count = len(usernames)
            
            # Scrape all text nodes and identify usernames
            page_data = await page.evaluate("""() => {
                const results = [];
                // Look for text inside divs, spans, h5s that match username patterns
                const all = document.querySelectorAll('div, span, h5, h4, h3, a');
                all.forEach(el => {
                    const text = el.innerText.trim();
                    // Instagram rules: 3-30 chars, letters, numbers, dots, underscores
                    if (/^[a-z0-9._]{3,30}$/i.test(text)) {
                        results.push(text.toLowerCase());
                    }
                });
                return results;
            }""")
            
            for name in page_data:
                if name not in ['profile', 'en', 'followed', 'search', 'results', 'posts', 'followers', 'following']:
                    if name not in usernames:
                        print(f"Found: @{name}")
                        usernames.add(name)
            
            if len(usernames) == current_count:
                consecutive_no_new += 1
            else:
                consecutive_no_new = 0
                
            # Smart Stop: If no new names found after 3 scrolls, we hit the end
            if consecutive_no_new >= 3 and i > 5:
                print("🛑 No new followers found after 3 scrolls. We reached the end!")
                break
                
            # Slow scroll
            print(f"Scrolling... ({len(usernames)} names total)")
            await page.mouse.wheel(0, 400)
            await asyncio.sleep(2.5)
            
        print(f"\nDONE! Total unique followers found: {len(usernames)}")
        if usernames:
            print("Names extracted successfully.")
        else:
            print("No names found. Please check if the Followers list opened correctly.")
        
        await asyncio.sleep(5)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(test_instacognito())
