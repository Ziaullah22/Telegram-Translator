import asyncio
import asyncpg
import os

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
        camp = await conn.fetchrow("SELECT auto_replies FROM campaigns WHERE id = 50")
        print(f"Global Auto-Replies for 50: {camp['auto_replies']}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(check())
