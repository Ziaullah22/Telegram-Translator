import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def check():
    load_dotenv()
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))
    
    # Check Campaign Status
    campaigns = await conn.fetch("SELECT id, name, status FROM instagram_campaigns WHERE user_id = 2")
    print("\n--- CAMPAIGN READINESS ---")
    if campaigns:
        for c in campaigns:
            print(f"Campaign '{c['name']}': {c['status'].upper()}")
    else:
        print("No campaigns found for User 2.")
        
    await conn.close()

if __name__ == "__main__":
    asyncio.run(check())
