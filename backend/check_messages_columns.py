import asyncio
from database import db

async def main():
    await db.connect()
    res = await db.fetch("SELECT * FROM messages LIMIT 1")
    if res:
        print(f"Columns: {list(res[0].keys())}")
    else:
        # If no messages, check via information_schema
        cols = await db.fetch("SELECT column_name FROM information_schema.columns WHERE table_name = 'messages'")
        print(f"Columns: {[c['column_name'] for c in cols]}")
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
