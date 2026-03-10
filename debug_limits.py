import asyncio
import asyncpg
import os
import datetime
from datetime import timezone, timedelta

async def check():
    db_url = "postgresql://postgres:postgres@localhost:5432/telegram_translator"
    env_path = os.path.join(os.getcwd(), 'backend', '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('DATABASE_URL='):
                    db_url = line.split('=')[1].strip()
                    break

    conn = await asyncpg.connect(db_url)
    try:
        window_start = datetime.datetime.now(timezone.utc) - timedelta(hours=24)
        print(f"Current UTC Time: {datetime.datetime.now(timezone.utc)}")
        print(f"Window Start: {window_start}")
        
        rows = await conn.fetch("""
            SELECT account_id, action, created_at, campaign_id, lead_id 
            FROM campaign_logs 
            WHERE created_at >= $1
            ORDER BY created_at DESC
        """, window_start)
        
        print(f"\n--- Logs found in last 24h: {len(rows)} ---")
        for r in rows:
            print(f"Account: {r['account_id']}, Action: {r['action']}, Campaign: {r['campaign_id']}, Time: {r['created_at']}")
            
        accounts = await conn.fetch("SELECT id, account_name FROM telegram_accounts WHERE is_active = true")
        print(f"\n--- Active Accounts: {len(accounts)} ---")
        for a in accounts:
            sent = await conn.fetchval("""
                SELECT COUNT(*) FROM campaign_logs 
                WHERE account_id = $1 AND action = 'initial_outreach' AND created_at >= $2
            """, a['id'], window_start)
            print(f"ID: {a['id']}, Name: {a['account_name']}, Sent in window: {sent}")

    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(check())
