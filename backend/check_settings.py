import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def check():
    load_dotenv()
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))
    
    # 🕵️ CHECK ALL Filter Settings for all users
    settings = await conn.fetch("SELECT * FROM instagram_filter_settings")
    print("\n--- 🛰️ ALL INSTAGRAM FILTER SETTINGS ---")
    if settings:
        for s in settings:
            item = dict(s)
            print(f"User {item['user_id']}: Bio='{item['bio_keywords']}', MinFollow={item['min_followers']}")
    else:
        print("No filter settings found in the system.")
        
    await conn.close()

if __name__ == "__main__":
    asyncio.run(check())
