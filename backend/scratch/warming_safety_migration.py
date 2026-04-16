import asyncio
from database import db
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def run_safety_migration():
    await db.connect()
    
    try:
        logger.info("Adding Safety & Aging columns to Warming Accounts...")
        
        await db.execute("""
            ALTER TABLE instagram_warming_accounts 
            ADD COLUMN IF NOT EXISTS daily_usage_count INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS last_usage_reset TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        """)
        logger.info("✅ Safety & Aging columns stabilized.")
    except Exception as e:
        logger.warning(f"Migration failed or columns already exist: {e}")

    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(run_safety_migration())
