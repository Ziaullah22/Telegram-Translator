import asyncio
import asyncpg
import os

async def migrate():
    # Try to load URL from backend/.env like the main app does
    db_url = "postgresql://postgres:postgres@localhost:5432/telegram_translator" # Fallback
    
    env_path = os.path.join(os.getcwd(), 'backend', '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('DATABASE_URL='):
                    db_url = line.split('=')[1].strip()
                    break

    print(f"Connecting to: {db_url}")
    conn = await asyncpg.connect(db_url)
    try:
        # Add is_muted column if it doesn't exist
        await conn.execute("""
            ALTER TABLE conversations 
            ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT FALSE
        """)
        print("Column is_muted added successfully")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(migrate())
