import asyncio
from patchright.async_api import async_playwright

PROXY = {
    "server": "http://p.webshare.io:80",
    "username": "ycliqgkd-rotate",
    "password": "rjhk9bjmss2f"
}

async def main():
    async with async_playwright() as p:
        print("Launching Chromium browser with Webshare rotating proxy...")
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
        
        print("Opening Google...")
        await page.goto("https://www.google.com/")
        
        print("\nBrowser window is open! You can use it now.")
        print("Close the terminal task or press Ctrl+C to close the browser.")
        
        # Keep the browser open indefinitely
        while True:
            await asyncio.sleep(1)

if __name__ == "__main__":
    asyncio.run(main())
