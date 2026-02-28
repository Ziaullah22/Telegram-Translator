import asyncio
import asyncpg
from app.core.config import settings

async def migrate():
    try:
        conn = await asyncpg.connect(settings.database_url)
        print("Connected to PostgreSQL")
        try:
            await conn.execute('ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE')
            print("Column is_read added successfully (or already exists)")
        except Exception as e:
            print(f"Error adding column: {e}")
        finally:
            await conn.close()
    except Exception as e:
        print(f"Failed to connect to database: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
