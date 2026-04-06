import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def monitor():
    load_dotenv()
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))
    
    # 🕵️ FULL DATABASE AUDIT (ALL USERS)
    leads = await conn.fetch("SELECT user_id, status, count(*) FROM instagram_leads GROUP BY user_id, status")
    print("\n--- 🏎️ GLOBAL LEAD INVENTORY ---")
    if leads:
        for row in leads:
            print(f"User {row['user_id']} | Status [{row['status'].upper()}]: {row['count']} leads")
    else:
        print("No leads found in the entire database.")
        
    await conn.close()

if __name__ == "__main__":
    asyncio.run(monitor())
