import asyncio
from database import db

async def migrate():
    await db.connect()
    print("Implementing Safety Freeze Protocol...")
    await db.execute("ALTER TABLE instagram_warming_accounts ADD COLUMN IF NOT EXISTS frozen_until TIMESTAMP WITH TIME ZONE")
    print("Schema Synchronized! Frozen accounts will now be automatically suspended.")
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(migrate())
