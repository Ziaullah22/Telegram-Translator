import asyncio
from database import db
from datetime import datetime, timedelta

async def reset_limits():
    """
    Script to reset campaign limits for testing.
    It moves the 'last_contact_at' timestamp back by 30 hours for all leads,
    making them eligible for new outreach immediately.
    """
    try:
        print("Connecting to database...")
        await db.connect()
        
        # 1. Reset the 24-hour 'Cold Outreach' limit
        await db.execute("""
            UPDATE campaign_leads 
            SET last_contact_at = NOW() - interval '30 hours' 
            WHERE last_contact_at IS NOT NULL
        """)
        
        # 2. Reset leads that were stuck in 'hibernating' or 'failed' (optional, usually helpful)
        await db.execute("""
            UPDATE campaign_leads 
            SET status = 'pending' 
            WHERE status IN ('failed', 'completed') 
            AND current_step = 0
        """)
        
        print("\n✅ SUCCESS: All campaign limits have been reset.")
        print("Bot will now treat all accounts as ready for fresh outreach.")
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
    finally:
        await db.disconnect()

if __name__ == "__main__":
    asyncio.run(reset_limits())
