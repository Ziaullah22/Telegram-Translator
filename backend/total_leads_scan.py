import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def scan():
    load_dotenv()
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))
    
    # Check TOTAL Counts
    total = await conn.fetchval("SELECT COUNT(*) FROM instagram_leads")
    by_user = await conn.fetch("SELECT user_id, status, COUNT(*) FROM instagram_leads GROUP BY user_id, status")
    
    print("\n--- DATABASE INTEGRITY SCAN ---")
    print(f"Total Leads in system: {total}")
    for row in by_user:
        print(f"User {row['user_id']} | Status [{row['status']}]: {row['count']}")
        
    await conn.close()

if __name__ == "__main__":
    asyncio.run(scan())
