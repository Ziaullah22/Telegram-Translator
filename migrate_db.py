import asyncio
import asyncpg
import os

async def migrate():
    url = "postgresql://postgres:postgres@localhost:5432/telegram_translator"
    conn = await asyncpg.connect(url)
    try:
        # Add is_muted column if it doesn't exist
        await conn.execute("""
            ALTER TABLE conversations 
            ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT FALSE
        """)
        print("Column is_muted added successfully")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(migrate())
