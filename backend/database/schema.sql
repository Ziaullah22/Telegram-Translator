-- PostgreSQL schema for Telegram Translator (local Postgres)

-- Users
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

-- Telegram accounts
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
  username VARCHAR(100), -- Store official @username
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_accounts_user_display_name ON telegram_accounts(user_id, display_name);
CREATE INDEX IF NOT EXISTS idx_telegram_accounts_user ON telegram_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_accounts_last_used ON telegram_accounts(last_used);

-- Conversation type enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conversation_type') THEN
    CREATE TYPE conversation_type AS ENUM ('private', 'group', 'supergroup', 'channel');
  END IF;
END $$;

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  telegram_account_id BIGINT NOT NULL REFERENCES telegram_accounts(id) ON DELETE CASCADE,
  telegram_peer_id BIGINT NOT NULL,
  title TEXT,
  type conversation_type NOT NULL,
  username VARCHAR(100), -- Store official @username
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  is_muted BOOLEAN NOT NULL DEFAULT FALSE,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_account_peer ON conversations(telegram_account_id, telegram_peer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at);

-- Message type enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_type') THEN
    CREATE TYPE message_type AS ENUM ('text', 'photo', 'video', 'voice', 'document', 'sticker', 'system', 'auto_reply');
  END IF;
END $$;

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  telegram_message_id BIGINT,
  sender_user_id BIGINT,
  sender_name VARCHAR(100) NOT NULL,
  sender_username VARCHAR(100) NOT NULL,
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
  is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  reply_to_telegram_id BIGINT,
  reply_to_text TEXT,
  reply_to_sender TEXT,
  reactions JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_encrypted ON messages(is_encrypted);

-- Message Templates
CREATE TABLE IF NOT EXISTS message_templates (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_message_templates_user ON message_templates(user_id);

-- Scheduled Messages
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
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_conversation ON scheduled_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_scheduled_at ON scheduled_messages(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status ON scheduled_messages(is_sent, is_cancelled, scheduled_at);

-- Contact CRM Information
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
  tags TEXT[] DEFAULT '{}',
  pipeline_stage VARCHAR(50) DEFAULT 'Lead',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contact_info_conversation ON contact_info(conversation_id);

-- Auto-responder rules table (global rules for all accounts)
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
CREATE INDEX IF NOT EXISTS idx_auto_responder_rules_user ON auto_responder_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_responder_rules_active ON auto_responder_rules(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_auto_responder_rules_priority ON auto_responder_rules(user_id, priority DESC);

-- Auto-responder logs (track when rules are triggered)
CREATE TABLE IF NOT EXISTS auto_responder_logs (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES auto_responder_rules(id) ON DELETE CASCADE,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  incoming_message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  outgoing_message_id BIGINT REFERENCES messages(id) ON DELETE SET NULL,
  matched_keyword TEXT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auto_responder_logs_rule ON auto_responder_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_auto_responder_logs_conversation ON auto_responder_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_auto_responder_logs_triggered_at ON auto_responder_logs(triggered_at);

-- System Settings for encryption and other global configurations
CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  encryption_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  encryption_enabled_at TIMESTAMPTZ,
  encryption_disabled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(50) DEFAULT 'admin',
  CONSTRAINT single_row_check CHECK (id = 1)
);

-- Insert default settings row
INSERT INTO system_settings (id, encryption_enabled)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;
