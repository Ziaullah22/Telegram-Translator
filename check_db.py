import asyncio
import os
import sys

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.core.database import db

async def check_columns():
    await db.connect()
    try:
        rows = await db.fetch("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'conversations'
        """)
        for row in rows:
            print(row['column_name'])
    finally:
        await db.disconnect()

if __name__ == "__main__":
    asyncio.run(check_columns())
