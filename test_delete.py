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
        print("Testing delete on instagram_leads...")
        res = await conn.execute("DELETE FROM instagram_leads WHERE id > 0")
        print(f"RESULT: {res}")
    except Exception as e:
        print(f"Update failed: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(migrate())
