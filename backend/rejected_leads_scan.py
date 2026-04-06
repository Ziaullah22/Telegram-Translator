import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def scan():
    load_dotenv()
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))
    
    # Check Rejection Samples (Corrected Column Name)
    leads = await conn.fetch("SELECT id, instagram_username, status, bio, follower_count FROM instagram_leads WHERE status = 'rejected' LIMIT 5")
    
    print("\n--- REJECTED LEADS TELEMETRY ---")
    if leads:
        for l in leads:
            print(f"Lead @{l['instagram_username']} (ID: {l['id']})")
            print(f"  Bio: '{l['bio']}'")
            print(f"  Follower Count: {l['follower_count']}")
            print("-" * 20)
    else:
        print("No rejected leads found.")
        
    await conn.close()

if __name__ == "__main__":
    asyncio.run(scan())
