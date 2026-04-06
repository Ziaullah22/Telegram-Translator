import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def monitor():
    load_dotenv()
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))
    
    # 🕵️ LIST ALL LEADS FOR USER 2
    leads = await conn.fetch("SELECT instagram_username, status FROM instagram_leads WHERE user_id = 2")
    print("\n--- USER 2 (ziaulah22) LEAD LIST ---")
    if leads:
        for row in leads:
            print(f"@{row['instagram_username']} [{row['status'].upper()}]")
    else:
        print("No leads found for User 2.")
        
    await conn.close()

if __name__ == "__main__":
    asyncio.run(monitor())
