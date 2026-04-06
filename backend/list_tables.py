import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def scan():
    load_dotenv()
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))
    
    # List all public tables
    tables = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    print("\n--- DATABASE TABLE ROLL CALL ---")
    for t in tables:
        print(f"- {t['table_name']}")
        
    await conn.close()

if __name__ == "__main__":
    asyncio.run(scan())
