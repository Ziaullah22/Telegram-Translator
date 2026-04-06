import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def check():
    load_dotenv()
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))
    
    # 🕵️ CHECK SPECIFIC LEAD (CORRECT SPELLING: ziaullah_khaan)
    lead = await conn.fetchrow("SELECT instagram_username, status, full_name, bio, follower_count FROM instagram_leads WHERE instagram_username = 'ziaullah_khaan'")
    if lead:
        item = dict(lead)
        print(f"\n--- SUCCESS REPORT: @{item['instagram_username']} ---")
        print(f"Status: {item['status'].upper()}")
        print(f"Name: '{item['full_name']}'")
        print(f"Bio: '{item['bio']}'")
        print(f"Followers: {item['follower_count']}")
    else:
        print("Lead @ziaullah_khaan not found.")
        
    await conn.close()

if __name__ == "__main__":
    asyncio.run(check())
