import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def reset():
    load_dotenv()
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))
    
    # Reset specific lead (CORRECT SPELLING: ziaullah_khaan)
    await conn.execute("UPDATE instagram_leads SET status = 'discovered', bio = '', follower_count = 0, full_name = '', recent_posts = '[]' WHERE instagram_username = 'ziaullah_khaan'")
    print("Lead @ziaullah_khaan reset successfully for User 2!")
        
    await conn.close()

if __name__ == "__main__":
    asyncio.run(reset())
