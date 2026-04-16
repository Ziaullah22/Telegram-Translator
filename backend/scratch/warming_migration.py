import asyncio
from database import db
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def run_migration():
    await db.connect()
    
    try:
        logger.info("Running Warming Tables Migrations...")
        
        # 1. Leads Table unique constraint
        await db.execute("""
            ALTER TABLE instagram_warming_leads 
            ADD CONSTRAINT warming_leads_user_username_unique UNIQUE (user_id, instagram_username);
        """)
        logger.info("✅ Added unique constraint to instagram_warming_leads")
    except Exception as e:
        logger.warning(f"Leads constraint already exists or failed: {e}")

    try:
        # 2. Accounts Table unique constraint
        await db.execute("""
            ALTER TABLE instagram_warming_accounts 
            ADD CONSTRAINT warming_accounts_username_unique UNIQUE (username);
        """)
        logger.info("✅ Added unique constraint to instagram_warming_accounts")
    except Exception as e:
        logger.warning(f"Accounts constraint already exists or failed: {e}")

    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(run_migration())
