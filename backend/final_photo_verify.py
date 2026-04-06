import asyncio
import asyncpg
import os
import json
from dotenv import load_dotenv

async def check():
    load_dotenv()
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))
    
    # 🕵️ CHECK SPECIFIC LEAD (CORRECT SPELLING: ziaullah_khaan)
    lead = await conn.fetchrow("SELECT recent_posts FROM instagram_leads WHERE instagram_username = 'ziaullah_khaan'")
    if lead:
        posts = json.loads(lead['recent_posts'] or '[]')
        print(f"\n--- VISUAL SUCCESS REPORT: @ziaullah_khaan ---")
        print(f"COUNT: {len(posts)} pictures")
        if posts:
            print(f"FIRST IMAGE URL: {posts[0]['display_url']}")
    else:
        print("Lead @ziaullah_khaan not found.")
        
    await conn.close()

if __name__ == "__main__":
    asyncio.run(check())
