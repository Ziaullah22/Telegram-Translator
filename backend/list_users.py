import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def scan():
    load_dotenv()
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))
    
    # List all users
    users = await conn.fetch("SELECT id, username FROM users")
    print("\n--- USER IDENTITY ROLL CALL ---")
    for u in users:
        print(f"ID {u['id']}: {u['username']}")
        
    await conn.close()

if __name__ == "__main__":
    asyncio.run(scan())
