import asyncio
import os
import sys

# Add parent directory to path to import app/backend modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

from database import db
from app.core.config import settings

async def migrate():
    print("Starting migration...")
    await db.connect()
    try:
        # 1. Add column to telegram_accounts
        print("Checking telegram_accounts table...")
        await db.execute("""
            ALTER TABLE telegram_accounts 
            ADD COLUMN IF NOT EXISTS translation_enabled BOOLEAN NOT NULL DEFAULT TRUE;
        """)
        print("Successfully added translation_enabled column.")
        
    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        await db.disconnect()
    print("Migration finished.")

if __name__ == "__main__":
    asyncio.run(migrate())
