import asyncio
from database import db

async def check():
    await db.connect()
    try:
        rows = await db.fetch("SELECT id, instagram_username, status, source, data_audit_json FROM instagram_leads LIMIT 10")
        print("--- LEADS ---")
        for row in rows:
            print(dict(row))
    finally:
        await db.disconnect()

asyncio.run(check())
