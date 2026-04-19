import asyncio
import random
import pyotp
from playwright.async_api import async_playwright

async def run_ghost_human_search():
    USERNAME = "jair_alok5802026"
    PASSWORD = "mahim@30"
    FA_SECRET = "JNPLHDNU5DK665VODFY4MBBBR3V2IVQ4"
    TARGET = "ziaullah_khaan"

    async with async_playwright() as p:
        print(f"🚀 Starting [Ghost-Human Search] for @{USERNAME}...")
        
        user_data_dir = f"./browser_sessions/{USERNAME}"
        context = await p.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=False,
            viewport={'width': 1280, 'height': 800},
            ignore_default_args=["--enable-automation"],
            args=["--disable-blink-features=AutomationControlled"],
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        )
        
        page = context.pages[0] if context.pages else await context.new_page()
        print("🌐 Navigating to Instagram Home...")
        await page.goto("https://www.instagram.com/", wait_until="load")
        await page.wait_for_timeout(random.randint(4000, 7000))

        # 🧩 [CHECK FOR PUZZLES/CHALLENGES]
        if "challenge" in page.url or "captcha" in page.url:
             print("⚠️ PUZZLE DETECTED! Waiting for manual solution or dismissal...")
             await page.wait_for_timeout(15000) # Give time to resolve

        # 1. 🔑 Handle Login (Skip if already in)
        user_input = await page.query_selector('input[name="email"], input[name="username"]')
        if user_input:
            print("⌨️ Session expired. Logging in with human typing...")
            await user_input.type(USERNAME, delay=random.randint(100, 250))
            await asyncio.sleep(random.uniform(1, 2))
            pass_input = await page.query_selector('input[name="pass"], input[name="password"]')
            if pass_input:
                await pass_input.type(PASSWORD, delay=random.randint(100, 250))
                await asyncio.sleep(1)
                await page.keyboard.press("Enter")
                await page.wait_for_timeout(10000)

        # 🧹 Cleanup popups
        popup_buttons = ["Not Now", "Allow", "Save Info"]
        for btn_text in popup_buttons:
            try:
                btn = await page.query_selector(f'button:has-text("{btn_text}"), button:text("{btn_text}")')
                if btn and await btn.is_visible(): await btn.click()
            except: pass

        # 🔍 [NEW HUMAN SEARCH FLOW]
        print(f"🔎 Activating Search to find @{TARGET}...")
        search_icon = await page.query_selector('svg[aria-label="Search"], a[href="#"]')
        if search_icon:
            await search_icon.click()
            await page.wait_for_timeout(2000)
            
            search_input = await page.query_selector('input[placeholder="Search"]')
            if search_input:
                print(f"⌨️ Typing '{TARGET}' into search bar...")
                await search_input.type(TARGET, delay=random.randint(150, 300))
                await page.wait_for_timeout(5000) # Wait for results to appear
                
                print(f"🖱️ Looking for exact match for @{TARGET} in results...")
                # Search for the specific result link or text
                result = await page.query_selector(f'a[href="/{TARGET}/"], span:has-text("{TARGET}")')
                if result:
                    print(f"✅ Found exact match! Clicking...")
                    await result.click()
                else:
                    print("⚠️ Could not find exact match in results, trying [Enter] fallback...")
                    await page.keyboard.press("Enter")
                    await asyncio.sleep(1)
                    await page.keyboard.press("Enter")
                
                # Wait for navigation to complete
                await page.wait_for_url(f"**/{TARGET}/", timeout=10000)
                print(f"✨ Successfully reached @{TARGET} profile!")
                await page.wait_for_timeout(4000)

        # 📖 [STAGE 3] Read Bio
        print("📖 Reading Biography...")
        try:
             # Look for the section that contains the profile info
             bio = await page.evaluate("""() => {
                 const bioContent = document.querySelector('header section div:nth-child(3)');
                 return bioContent ? bioContent.innerText : document.querySelector('header section').innerText;
             }""")
             print(f"📝 PROFILE DATA:\n{bio}")
        except: pass

        # 🌀 [STAGE 4] Open Followers
        print(f"🌀 Attempting to open followers...")
        followers_btn = await page.query_selector('a:has-text("followers")')
        if followers_btn:
            await followers_btn.click()
            await page.wait_for_timeout(5000)
            
            # 🖱️ HOVER AND SCROLL
            print("🖱️ Extraction started (Real Mouse Wheel Scrolling)...")
            usernames = set()
            
            for i in range(15):
                # Collector
                names = await page.evaluate("""() => {
                    const links = Array.from(document.querySelectorAll('div[role="dialog"] a[role="link"]'));
                    return links.map(l => l.innerText).filter(t => t && !t.includes('\\n') && t.length > 2);
                }""")
                for n in names: 
                    if n not in [USERNAME, TARGET, "Follow", "Following"]:
                        usernames.add(n)
                
                print(f"   📈 Harvested: {len(usernames)} users...")
                if len(usernames) >= 100: break
                
                # REAL MOUSE SCROLL: Hover over the modal first
                await page.mouse.move(640, 400) # Center of screen (where modal is)
                await page.mouse.wheel(0, 800) # Fast wheel scroll
                await asyncio.sleep(random.uniform(2, 4))

            print(f"✅ HARVEST COMPLETE! {len(usernames)} Leads Found.")
        else:
            print("⚠️ Could not find the 'followers' button.")

        print("✅ Demo Complete! Closing in 15 seconds.")
        await asyncio.sleep(15)
        await context.close()

if __name__ == "__main__":
    asyncio.run(run_ghost_human_search())
