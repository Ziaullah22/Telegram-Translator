import asyncio, asyncpg, os
from dotenv import load_dotenv
load_dotenv('.env')
DB_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/telegram_translator')

async def fix():
    conn = await asyncpg.connect(DB_URL)
    try:
        # 1. Show ALL columns of instagram_warming_leads
        cols = await conn.fetch("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'instagram_warming_leads'
            ORDER BY ordinal_position
        """)
        print("=== instagram_warming_leads columns ===")
        for c in cols:
            print(f"  {c['column_name']:35} {c['data_type']:20} nullable={c['is_nullable']} default={c['column_default']}")

        # 2. Try to insert a test row with ONLY the fields we provide
        print("\n=== Testing INSERT ===")
        try:
            result = await conn.execute("""
                INSERT INTO instagram_warming_leads (user_id, instagram_username, discovery_keyword, status)
                VALUES (2, 'test_diagnostic_probe', 'test', 'discovered')
                ON CONFLICT DO NOTHING
            """)
            print(f"INSERT result: {result}")
        except Exception as e:
            print(f"INSERT FAILED: {e}")

        # Cleanup
        await conn.execute("DELETE FROM instagram_warming_leads WHERE instagram_username = 'test_diagnostic_probe'")
        print("Cleanup done.")

    finally:
        await conn.close()

asyncio.run(fix())
