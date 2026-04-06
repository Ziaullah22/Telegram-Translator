import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def monitor():
    load_dotenv()
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))
    
    # 🕵️ Absolute One-Line Status Summary (NO TRUNCATION)
    counts = await conn.fetch("SELECT status, count(*) FROM instagram_leads WHERE user_id = 2 GROUP BY status")
    res = " ### ".join([f"{r['status'].upper()}: {r['count']}" for r in counts])
    print(f"\nziaulah22_LEADS: ### {res} ###")
    
    # 🛰️ Ghost Account Summary
    accounts = await conn.fetch("SELECT username, status FROM instagram_accounts WHERE user_id = 2")
    ghost_res = " ### ".join([f"@{r['username']} ({r['status']})" for r in accounts])
    print(f"ziaulah22_GHOSTS: ### {ghost_res} ###")
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(monitor())
