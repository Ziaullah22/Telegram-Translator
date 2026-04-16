import asyncio
import asyncpg
import os

async def inspect():
    try:
        conn = await asyncpg.connect('postgresql://postgres:postgres@localhost:5432/telegram_translator')
        
        print("\n--- PROXY TABLE INSPECTION ---")
        proxies = await conn.fetch("SELECT id, host, user_id FROM instagram_warming_proxies ORDER BY id ASC")
        for p in proxies:
            print(f"ID: {p['id']} | IP: {p['host']} | UserID: {p['user_id']}")
            
        print("\n--- ACCOUNT ASSIGNMENTS ---")
        accounts = await conn.fetch("SELECT username, proxy_id FROM instagram_warming_accounts ORDER BY id DESC LIMIT 20")
        for a in accounts:
            print(f"Account: {a['username']} | ProxyID: {a['proxy_id']}")
            
        await conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(inspect())
