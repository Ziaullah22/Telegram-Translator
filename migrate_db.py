import asyncio
import asyncpg
import os

async def migrate():
    # Try to load URL from backend/.env like the main app does
    db_url = "postgresql://postgres:postgres@localhost:5432/telegram_translator" # Default fallback
    
    # Path to backend/.env
    env_path = os.path.join(os.getcwd(), 'backend', '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('DATABASE_URL='):
                    db_url = line.split('=')[1].strip()
                    break

    print(f"Connecting to database: {db_url}")
    try:
        conn = await asyncpg.connect(db_url)
        print("Connected successfully!")
        
        try:
            # 1. Update conversations table: is_muted
            await conn.execute("""
                ALTER TABLE conversations 
                ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT FALSE
            """)
            print("✓ Check/Add column: conversations.is_muted")
            
            # 2. Update conversations table: is_hidden
            await conn.execute("""
                ALTER TABLE conversations 
                ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE
            """)
            print("✓ Check/Add column: conversations.is_hidden")
            
            # 3. Update messages table: is_read
            await conn.execute("""
                ALTER TABLE messages 
                ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE
            """)
            print("✓ Check/Add column: messages.is_read")
            
            print("\nDatabase synchronization completed successfully.")
            
        except Exception as e:
            print(f"\nError during schema update: {e}")
        finally:
            await conn.close()
            
    except Exception as e:
        print(f"\nFailed to connect to database. Please check your DATABASE_URL in backend/.env")
        print(f"Error: {e}")

if __name__ == "__main__":
    print("Starting Telegram Translator Database Migration...")
    asyncio.run(migrate())
