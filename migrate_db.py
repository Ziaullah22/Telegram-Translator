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
            
            # 3. Update messages table: is_read, replies, reactions
            await conn.execute("""
                ALTER TABLE messages 
                ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS reply_to_telegram_id BIGINT,
                ADD COLUMN IF NOT EXISTS reply_to_text TEXT,
                ADD COLUMN IF NOT EXISTS reply_to_sender TEXT,
                ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'
            """)
            print("✓ Check/Add columns: messages.is_read, replies, reactions")

            # 4. Update messages table: media fields
            await conn.execute("""
                ALTER TABLE messages 
                ADD COLUMN IF NOT EXISTS media_file_path TEXT,
                ADD COLUMN IF NOT EXISTS media_file_name TEXT,
                ADD COLUMN IF NOT EXISTS media_mime_type VARCHAR(100),
                ADD COLUMN IF NOT EXISTS media_file_size BIGINT,
                ADD COLUMN IF NOT EXISTS media_thumbnail_path TEXT,
                ADD COLUMN IF NOT EXISTS is_outgoing BOOLEAN NOT NULL DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS has_media BOOLEAN NOT NULL DEFAULT FALSE;
            """)
            print("✓ Check/Add columns: messages media fields")
            
            # 5. Update messages table: encryption
            await conn.execute("""
                ALTER TABLE messages 
                ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT FALSE;
            """)
            print("✓ Check/Add column: messages.is_encrypted")
            
            # 6. Check/Create system_settings table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS system_settings (
                id INTEGER PRIMARY KEY DEFAULT 1,
                encryption_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                encryption_enabled_at TIMESTAMPTZ,
                encryption_disabled_at TIMESTAMPTZ,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_by VARCHAR(50) DEFAULT 'admin',
                CONSTRAINT single_row_check CHECK (id = 1)
                );
                INSERT INTO system_settings (id, encryption_enabled)
                VALUES (1, FALSE)
                ON CONFLICT (id) DO NOTHING;
            """)
            print("✓ Check/Create table: system_settings")
            
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
