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
            print("Syncing schema...")
            
            # --- 1. CORE TABLES ---

            # Users
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id BIGSERIAL PRIMARY KEY,
                    username VARCHAR(50) NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    email VARCHAR(255),
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    last_login TIMESTAMPTZ
                );
                CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
            """)
            print("✓ Table: users")

            # Telegram accounts
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS telegram_accounts (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    display_name VARCHAR(100) NOT NULL,
                    account_name VARCHAR(100) NOT NULL,
                    app_id BIGINT NOT NULL,
                    app_hash VARCHAR(100) NOT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    source_language VARCHAR(16) NOT NULL DEFAULT 'auto',
                    target_language VARCHAR(16) NOT NULL DEFAULT 'en',
                    username VARCHAR(100),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    last_used TIMESTAMPTZ
                );
                CREATE INDEX IF NOT EXISTS idx_telegram_accounts_user ON telegram_accounts(user_id);
            """)
            print("✓ Table: telegram_accounts")

            # Conversation type enum and table
            await conn.execute("""
                DO $$ BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conversation_type') THEN
                        CREATE TYPE conversation_type AS ENUM ('private', 'group', 'supergroup', 'channel');
                    END IF;
                END $$;

                CREATE TABLE IF NOT EXISTS conversations (
                    id BIGSERIAL PRIMARY KEY,
                    telegram_account_id BIGINT NOT NULL REFERENCES telegram_accounts(id) ON DELETE CASCADE,
                    telegram_peer_id BIGINT NOT NULL,
                    title TEXT,
                    type conversation_type NOT NULL,
                    username VARCHAR(100),
                    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
                    is_muted BOOLEAN NOT NULL DEFAULT FALSE,
                    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    last_message_at TIMESTAMPTZ
                );
                CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_account_peer ON conversations(telegram_account_id, telegram_peer_id);
            """)
            print("✓ Table: conversations")

            # Message type enum and table
            await conn.execute("""
                DO $$ BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_type') THEN
                        CREATE TYPE message_type AS ENUM ('text', 'photo', 'video', 'voice', 'document', 'sticker', 'system', 'auto_reply');
                    END IF;
                END $$;

                CREATE TABLE IF NOT EXISTS messages (
                    id BIGSERIAL PRIMARY KEY,
                    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                    telegram_message_id BIGINT,
                    sender_user_id BIGINT,
                    sender_name VARCHAR(100) NOT NULL DEFAULT 'Unknown',
                    sender_username VARCHAR(100) NOT NULL DEFAULT 'unknown',
                    type message_type NOT NULL DEFAULT 'text',
                    original_text TEXT,
                    translated_text TEXT,
                    source_language VARCHAR(16),
                    target_language VARCHAR(16),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    edited_at TIMESTAMPTZ,
                    is_outgoing BOOLEAN NOT NULL DEFAULT FALSE,
                    has_media BOOLEAN NOT NULL DEFAULT FALSE,
                    media_file_name VARCHAR(255),
                    media_file_path TEXT,
                    media_mime_type VARCHAR(100),
                    media_file_size BIGINT,
                    media_thumbnail_path TEXT,
                    is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
                    is_read BOOLEAN NOT NULL DEFAULT FALSE,
                    reply_to_telegram_id BIGINT,
                    reply_to_text TEXT,
                    reply_to_sender TEXT,
                    reactions JSONB DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id);
            """)
            print("✓ Table: messages")

            # --- 2. ADDITIONAL CORE TABLES ---

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS message_templates (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    name VARCHAR(100) NOT NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS scheduled_messages (
                    id BIGSERIAL PRIMARY KEY,
                    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                    message_text TEXT NOT NULL,
                    scheduled_at TIMESTAMPTZ NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    is_sent BOOLEAN NOT NULL DEFAULT FALSE,
                    is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
                    sent_at TIMESTAMPTZ,
                    cancelled_at TIMESTAMPTZ
                );

                CREATE TABLE IF NOT EXISTS contact_info (
                    id BIGSERIAL PRIMARY KEY,
                    conversation_id BIGINT NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
                    name VARCHAR(255),
                    address TEXT,
                    telephone VARCHAR(50),
                    telegram_id VARCHAR(100),
                    telegram_id2 VARCHAR(100),
                    signal_id VARCHAR(100),
                    signal_id2 VARCHAR(100),
                    product_interest TEXT,
                    sales_volume VARCHAR(100),
                    ready_for_sample BOOLEAN DEFAULT FALSE,
                    sample_recipient_info TEXT,
                    sample_feedback TEXT,
                    payment_method VARCHAR(100),
                    delivery_method VARCHAR(100),
                    note TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            """)
            print("✓ Tables: templates, scheduled, contact_info")

            # Auto Responder
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS auto_responder_rules (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    name VARCHAR(100) NOT NULL,
                    keywords TEXT[] NOT NULL,
                    response_text TEXT NOT NULL,
                    language VARCHAR(10) NOT NULL DEFAULT 'en',
                    media_type VARCHAR(20),
                    media_file_path TEXT,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    priority INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS auto_responder_logs (
                    id BIGSERIAL PRIMARY KEY,
                    rule_id BIGINT NOT NULL REFERENCES auto_responder_rules(id) ON DELETE CASCADE,
                    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                    incoming_message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
                    outgoing_message_id BIGINT REFERENCES messages(id) ON DELETE SET NULL,
                    matched_keyword TEXT NOT NULL,
                    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            """)
            print("✓ Tables: auto_responder")

            # System Settings
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
            print("✓ Table: system_settings")

            # --- 3. CAMPAIGN TABLES ---

            await conn.execute("""
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
                    failure_reason TEXT,
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
            print("✓ Tables: campaigns, steps, leads, logs")

            # --- 4. SCHEMA UPDATES (Incremental fixes) ---
            
            # Ensure latest columns exist if tables were created via old scripts
            await conn.execute("""
                ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT FALSE;
                ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;
                ALTER TABLE conversations ADD COLUMN IF NOT EXISTS username VARCHAR(100);
                
                ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;
                ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_telegram_id BIGINT;
                ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_text TEXT;
                ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_sender TEXT;
                ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}';
                ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT FALSE;
                
                ALTER TABLE telegram_accounts ADD COLUMN IF NOT EXISTS username VARCHAR(100);
                
                ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS failure_reason TEXT;
            """)
            print("✓ Incremental updates applied.")

            print("\nDatabase initialization/synchronization completed successfully.")
            
        except Exception as e:
            print(f"\nError during schema update: {e}")
        finally:
            await conn.close()
            
    except Exception as e:
        print(f"\nFailed to connect to database. Please check your DATABASE_URL in backend/.env")
        print(f"Error: {e}")

if __name__ == "__main__":
    print("Starting Telegram Translator Database Migration/Init...")
    asyncio.run(migrate())
