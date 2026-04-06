import asyncio
import os
from dotenv import load_dotenv
from database import db
from instagram_service import InstagramService

async def start():
    load_dotenv()
    # 🏎️ CRITICAL: Initialize Database Connection Pool first!
    await db.connect()
    
    s = InstagramService()
    
    # User ID 2 is ziaulah22
    lead = await db.fetchrow("SELECT id, instagram_username FROM instagram_leads WHERE instagram_username = 'ziaullah_khaan' AND user_id = 2")
    
    if lead:
        print(f"🛰️ Success: Manual analysis triggered for @{lead['instagram_username']} (User 2)...")
        await s.analyze_lead(2, lead['id'])
        print("✅ Analysis successfully complete! Refresh your dashboard to see Name, Bio, and Followers!")
    else:
        print("❌ Lead @ziaullah_khaan not found. Please ensure it exists for User 2.")
        
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(start())
