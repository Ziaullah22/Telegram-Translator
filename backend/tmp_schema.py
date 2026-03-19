import asyncio
from database import db

async def main():
    await db.connect()
    rows = await db.fetch("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sales_settings'")
    for r in rows:
        print(f"{r['column_name']}: {r['data_type']}")
    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
