import asyncio
import asyncpg
import os

async def backfill():
    db_url = "postgresql://postgres:postgres@localhost:5432/telegram_translator"
    env_path = os.path.join(os.getcwd(), 'backend', '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('DATABASE_URL='):
                    db_url = line.split('=')[1].strip()
                    break

    print("Connecting to database...")
    conn = await asyncpg.connect(db_url)
    try:
        print("Backfilling account_id in campaign_logs...")
        updated = await conn.execute("""
            UPDATE campaign_logs cl
            SET account_id = (SELECT assigned_account_id FROM campaign_leads l WHERE l.id = cl.lead_id)
            WHERE cl.account_id IS NULL AND cl.lead_id IS NOT NULL
        """)
        print(f"✓ Updated {updated} logs.")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(backfill())
