import asyncio
from database import db

async def migrate():
    await db.connect()
    print("Repairing Warming Accounts Table...")
    await db.execute("ALTER TABLE instagram_warming_accounts ADD COLUMN IF NOT EXISTS verification_code VARCHAR(50)")
    await db.execute("ALTER TABLE instagram_warming_accounts ADD COLUMN IF NOT EXISTS settings_dump JSONB")
    print("Schema Synchronized!")
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(migrate())
