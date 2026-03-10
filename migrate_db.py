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
            
            # 5. Update telegram_accounts table: username
            await conn.execute("""
                ALTER TABLE telegram_accounts 
                ADD COLUMN IF NOT EXISTS username VARCHAR(100);
            """)
            print("✓ Check/Add column: telegram_accounts.username")
            
            # 6. Update messages table: encryption
            await conn.execute("""
                ALTER TABLE messages 
                ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT FALSE;
            """)
            print("✓ Check/Add column: messages.is_encrypted")
            
            # 7. Update conversations table: username
            await conn.execute("""
                ALTER TABLE conversations 
                ADD COLUMN IF NOT EXISTS username VARCHAR(100);
            """)
            print("✓ Check/Add column: conversations.username")
            
            # 8. Check/Create system_settings table
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
            
            # 9. Create Campaign Tables
            await conn.execute("""
                -- Campaign Management Tables
                CREATE TABLE IF NOT EXISTS campaigns (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    name VARCHAR(255) NOT NULL,
                    initial_message TEXT NOT NULL,
                    status VARCHAR(50) DEFAULT 'draft',
                    total_leads INTEGER DEFAULT 0,
                    completed_leads INTEGER DEFAULT 0,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS campaign_steps (
                    id SERIAL PRIMARY KEY,
                    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
                    step_number INTEGER NOT NULL,
                    wait_time_hours FLOAT DEFAULT 0,
                    keywords JSONB DEFAULT '[]',
                    response_text TEXT NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(campaign_id, step_number)
                );

                CREATE TABLE IF NOT EXISTS campaign_leads (
                    id SERIAL PRIMARY KEY,
                    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
                    telegram_identifier VARCHAR(255) NOT NULL,
                    current_step INTEGER DEFAULT 0,
                    status VARCHAR(50) DEFAULT 'pending',
                    last_contact_at TIMESTAMP WITH TIME ZONE,
                    assigned_account_id INTEGER REFERENCES telegram_accounts(id) ON DELETE SET NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(campaign_id, telegram_identifier)
                );

                CREATE TABLE IF NOT EXISTS campaign_logs (
                    id SERIAL PRIMARY KEY,
                    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
                    lead_id INTEGER REFERENCES campaign_leads(id) ON DELETE CASCADE,
                    action VARCHAR(255) NOT NULL,
                    details TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)
            print("✓ Check/Create tables: campaigns, campaign_steps, campaign_leads, campaign_logs")

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
