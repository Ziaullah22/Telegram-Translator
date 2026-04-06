import asyncio
import os
import sys

# Add current path to sys.path to find database.py
sys.path.append(os.getcwd())

from database import db

async def migrate():
    try:
        await db.connect()
        # Add following_count if it doesn't exist
        await db.execute("""
            ALTER TABLE instagram_leads 
            ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0
        """)
        print("✅ SUCCESS: 'following_count' column verified/added.")
    except Exception as e:
        print(f"❌ ERROR: {e}")
    finally:
        await db.close()

if __name__ == "__main__":
    asyncio.run(migrate())
