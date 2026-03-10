import asyncio
import asyncpg
import os
from datetime import datetime, timedelta, timezone

async def reset_limits():
    # Try to load URL from backend/.env like the main app does
    db_url = "postgresql://postgres:postgres@localhost:5432/telegram_translator" # Default fallback
    
    # Path to backend/.env
    env_path = os.path.join(os.getcwd(), 'backend', '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('DATABASE_URL='):
                    db_url = line.split('=')[1].strip()
                    break

    print(f"Connecting to database to reset campaign limits...")
    try:
        conn = await asyncpg.connect(db_url)
        print("Connected successfully!")
        
        try:
            # We "reset" the limits by moving the contact timestamps to yesterday.
            # This preserves the data but makes them not count for "today's" limit.
            yesterday = datetime.now(timezone.utc) - timedelta(days=1)
            
            # 1. Update campaign_leads
            leads_updated = await conn.execute(
                "UPDATE campaign_leads SET last_contact_at = $1 WHERE last_contact_at >= CURRENT_DATE",
                yesterday
            )
            
            # 2. Update campaign_logs
            logs_updated = await conn.execute(
                "UPDATE campaign_logs SET created_at = $1 WHERE created_at >= CURRENT_DATE",
                yesterday
            )
            
            # 3. Reset Failed Leads to Pending
            # This allows you to retry the ones that failed before the new logging was added
            failed_reset = await conn.execute(
                "UPDATE campaign_leads SET status = 'pending', failure_reason = NULL WHERE status = 'failed'"
            )
            
            print(f"✓ Reset completed.")
            print(f"  - Leads adjusted (Daily limits): {leads_updated}")
            print(f"  - Logs adjusted (Daily limits): {logs_updated}")
            print(f"  - Failed leads reset to pending: {failed_reset}")
            print("\nYou can now run the campaigns again. The 'failed' leads have been reset so you can see the new error reasons!")
            
        except Exception as e:
            print(f"\nError during reset: {e}")
        finally:
            await conn.close()
            
    except Exception as e:
        print(f"\nFailed to connect to database. {e}")

if __name__ == "__main__":
    asyncio.run(reset_limits())
