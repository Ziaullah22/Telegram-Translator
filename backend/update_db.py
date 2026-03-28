import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def run():
    load_dotenv()
    db_url = os.getenv("DATABASE_URL")
    print(f"Connecting to {db_url}")
    conn = await asyncpg.connect(db_url)
    try:
        await conn.execute("ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS language_expert_packs JSONB DEFAULT '{}';")
        print("Column added successfully!")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(run())
