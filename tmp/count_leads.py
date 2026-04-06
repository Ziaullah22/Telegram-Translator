import asyncio
import asyncpg

async def run():
    conn = await asyncpg.connect('postgresql://postgres:postgres@localhost:5432/telegram_translator')
    n = await conn.fetchval("SELECT COUNT(*) FROM instagram_leads")
    print(f"Total leads in database: {n}")
    
    # Also print some examples if any
    if n > 0:
        rows = await conn.fetch("SELECT instagram_username, discovery_keyword FROM instagram_leads LIMIT 5")
        for r in rows:
            print(f" - @{r['instagram_username']} ({r['discovery_keyword']})")
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(run())
