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
        campaigns = await conn.fetch("SELECT id, name, status FROM campaigns")
        print("CAMPAIGNS:")
        for camp in campaigns:
            print(f"ID: {camp['id']}, Name: {camp['name']}, Status: {camp['status']}")
            
            leads = await conn.fetch("SELECT id, telegram_identifier, current_step, status FROM campaign_leads WHERE campaign_id = $1", camp['id'])
            print(f"  LEADS for {camp['id']}:")
            for lead in leads:
                print(f"    ID: {lead['id']}, Identifier: {lead['telegram_identifier']}, Step: {lead['current_step']}, Status: {lead['status']}")
            
            steps = await conn.fetch("SELECT step_number, keywords FROM campaign_steps WHERE campaign_id = $1", camp['id'])
            print(f"  STEPS for {camp['id']}:")
            for step in steps:
                print(f"    Step {step['step_number']}, Keywords: {step['keywords']}")
                
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(check())
