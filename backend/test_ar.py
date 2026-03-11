import asyncio
import asyncpg
import json

async def check():
    conn = await asyncpg.connect('postgresql://postgres:postgres@localhost:5432/telegram_translator')
    try:
        logs = await conn.fetch("SELECT * FROM campaign_logs ORDER BY id DESC LIMIT 5")
        for log in logs:
            print(dict(log))
    except Exception as e:
        print("DB ERROR:", e)
    await conn.close()

asyncio.run(check())
