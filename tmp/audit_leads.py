import asyncio
import asyncpg

async def audit():
    try:
        conn = await asyncpg.connect('postgresql://postgres:postgres@localhost:5432/telegram_translator')
        leads = await conn.fetch("SELECT id, instagram_username, full_name, bio, status FROM instagram_leads ORDER BY id DESC LIMIT 5")
        print("\n--- RECENT LEADS AUDIT ---")
        for l in leads:
            print(f"ID: {l['id']} | @{l['instagram_username']} | Name: '{l['full_name']}' | Status: {l['status']}")
        await conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(audit())
