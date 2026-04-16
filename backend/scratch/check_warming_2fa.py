import asyncio
from database import db

async def check():
    await db.connect()
    rows = await db.fetch("SELECT id, username, verification_code FROM instagram_warming_accounts")
    for r in rows:
        print(f"ID: {r['id']} | User: {r['username']} | 2FA: {r['verification_code']}")
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(check())
