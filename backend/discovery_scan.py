import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def scan():
    load_dotenv()
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))
    
    # Check Discovery Counts
    disc_count = await conn.fetchval("SELECT COUNT(*) FROM instagram_discoveries")
    lead_count = await conn.fetchval("SELECT COUNT(*) FROM instagram_leads")
    
    print("\n--- LEAD INVENTORY REPORT ---")
    print(f"Total leads currently in Stage 1 (Discovery): {disc_count}")
    print(f"Total leads currently in Stage 2 (Analysis): {lead_count}")
        
    await conn.close()

if __name__ == "__main__":
    asyncio.run(scan())
