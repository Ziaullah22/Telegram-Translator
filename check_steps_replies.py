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
        steps = await conn.fetch("SELECT step_number, keywords, auto_replies FROM campaign_steps WHERE campaign_id = 50 ORDER BY step_number")
        print("STEPS for 50:")
        for step in steps:
            print(f"Step {step['step_number']}:")
            print(f"  Keywords: {step['keywords']}")
            print(f"  Auto-Replies: {step['auto_replies']}")
                
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(check())
