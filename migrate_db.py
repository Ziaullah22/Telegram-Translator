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
                    translation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
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
                    media_thumbnail TEXT,
                    media_duration INTEGER,
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
                    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
                    name VARCHAR(255) NOT NULL,
                    initial_message TEXT NOT NULL,
                    status VARCHAR(50) DEFAULT 'draft',
                    total_leads INTEGER DEFAULT 0,
                    completed_leads INTEGER DEFAULT 0,
                    replied_leads INTEGER DEFAULT 0,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    negative_keywords JSONB DEFAULT '[]',
                    kill_switch_enabled BOOLEAN DEFAULT TRUE,
                    auto_replies JSONB DEFAULT '[]'
                );

                CREATE TABLE IF NOT EXISTS campaign_steps (
                    id SERIAL PRIMARY KEY,
                    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
                    step_number INTEGER NOT NULL,
                    wait_time_hours FLOAT DEFAULT 0,
                    keywords JSONB DEFAULT '[]',
                    response_text TEXT NOT NULL,
                    keyword_response_text TEXT,
                    next_step INTEGER,
                    auto_replies JSONB DEFAULT '[]',
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
                    first_contacted_at TIMESTAMP WITH TIME ZONE,
                    responded_at TIMESTAMP WITH TIME ZONE,
                    response_time_seconds INTEGER,
                    replied_at_step INTEGER,
                    assigned_account_id BIGINT REFERENCES telegram_accounts(id) ON DELETE SET NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(campaign_id, telegram_identifier)
                );

                CREATE TABLE IF NOT EXISTS campaign_logs (
                    id SERIAL PRIMARY KEY,
                    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
                    lead_id INTEGER REFERENCES campaign_leads(id) ON DELETE SET NULL,
                    account_id BIGINT REFERENCES telegram_accounts(id) ON DELETE SET NULL,
                    action VARCHAR(255) NOT NULL,
                    details TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)
            print("✓ Tables: campaigns, steps, leads, logs")

            # --- 4. SALES & INVENTORY TABLES ---

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS products (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    name VARCHAR(255) NOT NULL,
                    description TEXT,
                    price DECIMAL(12, 2) NOT NULL DEFAULT 0,
                    stock_quantity INTEGER NOT NULL DEFAULT 0,
                    keywords JSONB DEFAULT '[]'::jsonb,
                    photo_url TEXT,
                    photo_urls JSONB DEFAULT '[]'::jsonb,
                    delivery_mode VARCHAR(20) DEFAULT 'both',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);

                CREATE TABLE IF NOT EXISTS sales_settings (
                    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    payment_details TEXT,
                    payment_reminder_message TEXT DEFAULT 'Hello! We haven''t received your payment screenshot for Order {order_id}. Please send it when you can. 🙏',
                    payment_reminder_interval_hours FLOAT DEFAULT 2.0,
                    payment_reminder_count INTEGER DEFAULT 3,
                    status_messages JSONB DEFAULT '{
                        "paid": "✅ Your payment has been verified! We are now preparing your order.",
                        "packed": "📦 Your order has been packed and is ready for shipment!",
                        "shipped": "🚚 Your order is on its way! We will update you on the delivery progress.",
                        "delivered": "🎁 Order delivered! Thank you for shopping with us.",
                        "disapproved": "❌ Your payment verification was unsuccessful. Reason: {reason}. Please send a new screenshot."
                    }'::jsonb,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS orders (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    po_number VARCHAR(100) NOT NULL UNIQUE,
                    product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
                    telegram_account_id BIGINT REFERENCES telegram_accounts(id) ON DELETE SET NULL,
                    telegram_peer_id BIGINT NOT NULL,
                    quantity INTEGER NOT NULL DEFAULT 1,
                    unit_price DECIMAL(12, 2) NOT NULL,
                    total_price DECIMAL(12, 2) NOT NULL,
                    status VARCHAR(50) DEFAULT 'pending_payment',
                    delivery_method VARCHAR(20),
                    delivery_address TEXT,
                    delivery_time_slot VARCHAR(100),
                    delivery_instructions TEXT,
                    payment_screenshot_path TEXT,
                    disapproval_reason TEXT,
                    reminder_count INTEGER DEFAULT 0,
                    last_reminder_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
                CREATE INDEX IF NOT EXISTS idx_orders_po ON orders(po_number);

                CREATE TABLE IF NOT EXISTS sales_states (
                    id BIGSERIAL PRIMARY KEY,
                    telegram_account_id BIGINT NOT NULL,
                    telegram_peer_id BIGINT NOT NULL,
                    status VARCHAR(50) NOT NULL DEFAULT 'idle',
                    pending_product_id BIGINT,
                    pending_quantity INTEGER,
                    delivery_mode VARCHAR(20),
                    delivery_method VARCHAR(20),
                    delivery_address TEXT,
                    delivery_time_slot VARCHAR(100),
                    delivery_instructions TEXT,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(telegram_account_id, telegram_peer_id)
                );
            """)
            print("✓ Tables: products, orders, sales_settings")

            # --- 5. SCHEMA UPDATES (Incremental fixes) ---
            
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
                
                ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_thumbnail TEXT;
                ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_duration INTEGER;
                
                ALTER TABLE telegram_accounts ADD COLUMN IF NOT EXISTS username VARCHAR(100);
                ALTER TABLE telegram_accounts ADD COLUMN IF NOT EXISTS translation_enabled BOOLEAN NOT NULL DEFAULT TRUE;
                
                ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS failure_reason TEXT;
                ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS first_contacted_at TIMESTAMP WITH TIME ZONE;
                ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS responded_at TIMESTAMP WITH TIME ZONE;
                ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS response_time_seconds INTEGER;
                ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS replied_at_step INTEGER;

                -- Bulletproof Safety: Add account_id to logs and remove strict cascade dependencies
                ALTER TABLE campaign_logs ADD COLUMN IF NOT EXISTS account_id BIGINT REFERENCES telegram_accounts(id) ON DELETE SET NULL;
                ALTER TABLE campaign_logs ALTER COLUMN campaign_id DROP NOT NULL;
                ALTER TABLE campaign_logs ALTER COLUMN lead_id DROP NOT NULL;
                
                -- Replied leads stat column
                ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS replied_leads INTEGER DEFAULT 0;

                -- ID tracking for bulletproof reply detection
                ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS telegram_id BIGINT;
                ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS restarted_at TIMESTAMP WITH TIME ZONE;

                -- Milestone 5: Sequence Builder & Kill Switch & Auto Replies
                ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS negative_keywords JSONB DEFAULT '[]';
                ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS kill_switch_enabled BOOLEAN DEFAULT TRUE;
                ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS auto_replies JSONB DEFAULT '[]';
                ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS is_hibernating BOOLEAN DEFAULT FALSE;
                ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS next_reset_at TIMESTAMPTZ;
                
                ALTER TABLE campaign_steps ADD COLUMN IF NOT EXISTS next_step INTEGER;
                ALTER TABLE campaign_steps ADD COLUMN IF NOT EXISTS keyword_response_text TEXT;
                ALTER TABLE campaign_steps ADD COLUMN IF NOT EXISTS auto_replies JSONB DEFAULT '[]';

                -- Milestone: Inventory Updates
                ALTER TABLE products ADD COLUMN IF NOT EXISTS photo_url TEXT;
                ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(20) DEFAULT 'both';
                
                ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_method VARCHAR(20);
                ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
                ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_time_slot VARCHAR(100);
                ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_instructions TEXT;
                ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
                ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;

                -- Repair column types (Safe Migration to JSONB)
                DO $$ 
                BEGIN
                    -- Keywords
                    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'keywords') THEN
                        -- Temporarily drop default to avoid cast conflicts
                        ALTER TABLE products ALTER COLUMN keywords DROP DEFAULT;
                        -- Attempt conversion
                        BEGIN
                             ALTER TABLE products ALTER COLUMN keywords TYPE JSONB USING keywords::jsonb;
                        EXCEPTION WHEN OTHERS THEN
                             ALTER TABLE products ALTER COLUMN keywords TYPE JSONB USING to_jsonb(keywords);
                        END;
                        ALTER TABLE products ALTER COLUMN keywords SET DEFAULT '[]'::jsonb;
                    ELSE
                        ALTER TABLE products ADD COLUMN keywords JSONB DEFAULT '[]'::jsonb;
                    END IF;

                    -- Photo URLs
                    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'photo_urls') THEN
                        ALTER TABLE products ALTER COLUMN photo_urls DROP DEFAULT;
                        BEGIN
                             ALTER TABLE products ALTER COLUMN photo_urls TYPE JSONB USING photo_urls::jsonb;
                        EXCEPTION WHEN OTHERS THEN
                             ALTER TABLE products ALTER COLUMN photo_urls TYPE JSONB USING to_jsonb(photo_urls);
                        END;
                        ALTER TABLE products ALTER COLUMN photo_urls SET DEFAULT '[]'::jsonb;
                    ELSE
                        ALTER TABLE products ADD COLUMN photo_urls JSONB DEFAULT '[]'::jsonb;
                    END IF;
                END $$;

                ALTER TABLE sales_states ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(20);
                ALTER TABLE sales_states ADD COLUMN IF NOT EXISTS delivery_method VARCHAR(20);
                ALTER TABLE sales_states ADD COLUMN IF NOT EXISTS delivery_address TEXT;
                ALTER TABLE sales_states ADD COLUMN IF NOT EXISTS delivery_time_slot VARCHAR(100);
                ALTER TABLE sales_states ADD COLUMN IF NOT EXISTS delivery_instructions TEXT;

                -- New Inventory & Sales Management Columns
                ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_screenshot_path TEXT;
                ALTER TABLE orders ADD COLUMN IF NOT EXISTS disapproval_reason TEXT;
                ALTER TABLE orders ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;
                ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;

                ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS payment_reminder_message TEXT;
                ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS payment_reminder_interval_days INTEGER DEFAULT 0;
                ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS payment_reminder_interval_hours INTEGER DEFAULT 2;
                ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS payment_reminder_interval_minutes INTEGER DEFAULT 0;
                ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS payment_reminder_count INTEGER DEFAULT 3;
                ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS disapproved_reminder_message TEXT;
                ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS disapproved_reminder_interval_days INTEGER DEFAULT 0;
                ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS disapproved_reminder_interval_hours INTEGER DEFAULT 2;
                ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS disapproved_reminder_interval_minutes INTEGER DEFAULT 0;
                ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS disapproved_reminder_count INTEGER DEFAULT 3;
                ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS status_messages JSONB DEFAULT '{}'::jsonb;
                
                CREATE TABLE IF NOT EXISTS order_proofs (
                    id SERIAL PRIMARY KEY,
                    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
                    file_path TEXT NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );

                -- Columns already repaired above in robust block

                -- Important: Change CASCADE DELETE to SET NULL so logs survive campaign deletion
                DO $$
                BEGIN
                    -- Campaign ID constraint
                    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'campaign_logs_campaign_id_fkey') THEN
                        ALTER TABLE campaign_logs DROP CONSTRAINT campaign_logs_campaign_id_fkey;
                    END IF;
                    ALTER TABLE campaign_logs ADD CONSTRAINT campaign_logs_campaign_id_fkey 
                        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

                    -- Lead ID constraint
                    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'campaign_logs_lead_id_fkey') THEN
                        ALTER TABLE campaign_logs DROP CONSTRAINT campaign_logs_lead_id_fkey;
                    END IF;
                    ALTER TABLE campaign_logs ADD CONSTRAINT campaign_logs_lead_id_fkey 
                        FOREIGN KEY (lead_id) REFERENCES campaign_leads(id) ON DELETE SET NULL;

                END $$;
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
