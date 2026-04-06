import asyncio
import asyncpg

async def run():
    conn = await asyncpg.connect('postgresql://postgres:postgres@localhost:5432/telegram_translator')
    res = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
    print("ALL PUBLIC TABLES:")
    for r in res:
        print(f" - {r['table_name']}")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(run())
