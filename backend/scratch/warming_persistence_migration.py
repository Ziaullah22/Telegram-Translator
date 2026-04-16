import asyncio
from database import db

async def migrate():
    await db.connect()
    print("Adding settings_dump column...")
    await db.execute("ALTER TABLE instagram_warming_accounts ADD COLUMN IF NOT EXISTS settings_dump JSONB")
    print("Done!")
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(migrate())
