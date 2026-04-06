import asyncio
from database import db
async def add_column():
    await db.connect()
    await db.execute('ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP')
    print("Column added successfully!")
    await db.close()

if __name__ == "__main__":
    asyncio.run(add_column())
