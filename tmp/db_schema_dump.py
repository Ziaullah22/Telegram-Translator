import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect('postgresql://postgres:postgres@localhost:5432/telegram_translator')
    rows = await conn.fetch("""
        SELECT table_name, column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema='public' AND table_name LIKE 'instagram_warming_%' 
        ORDER BY table_name, ordinal_position;
    """)
    for r in rows:
        print(f"{r[0]}.{r[1]} : {r[2]}")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
