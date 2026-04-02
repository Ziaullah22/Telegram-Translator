import asyncio
from database import db

async def main():
    await db.connect()
    # For PostgreSQL
    res = await db.fetch("""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'users'
    """)
    for row in res:
        print(dict(row))
    await db.close()

if __name__ == "__main__":
    asyncio.run(main())
