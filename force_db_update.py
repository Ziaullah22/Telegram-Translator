import asyncio
import asyncpg
import os

async def migrate():
    db_url = "postgresql://postgres:postgres@localhost:5432/telegram_translator"
    env_path = os.path.join(os.getcwd(), 'backend', '.env')
    if os.path.exists(env_path):
        for line in open(env_path):
            if line.startswith('DATABASE_URL='):
                db_url = line.split('=')[1].strip()
                break

    print(f"Connecting to: {db_url}")
    conn = await asyncpg.connect(db_url)
    try:
        print("Applying Human-Feel Agent Columns...")
        await conn.execute("ALTER TABLE instagram_leads ADD COLUMN IF NOT EXISTS assigned_account_id BIGINT REFERENCES instagram_accounts(id) ON DELETE SET NULL;")
        await conn.execute("ALTER TABLE instagram_leads ADD COLUMN IF NOT EXISTS assigned_account_name TEXT;")
        print("DATABASE UPDATED SUCCESSFULLY")
    except Exception as e:
        print(f"Update failed: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(migrate())
