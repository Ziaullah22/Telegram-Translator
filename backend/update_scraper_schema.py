import asyncio
from database import db

async def update_schema():
    print("Connecting to database...")
    await db.connect()
    try:
        print("Updating instagram_accounts table...")
        await db.execute("""
            ALTER TABLE instagram_accounts 
            ADD COLUMN IF NOT EXISTS daily_usage_count INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS last_usage_reset TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            ADD COLUMN IF NOT EXISTS frozen_until TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS warming_session_count INTEGER DEFAULT 0;
        """)
        print("Schema updated successfully!")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await db.disconnect()

if __name__ == "__main__":
    asyncio.run(update_schema())
