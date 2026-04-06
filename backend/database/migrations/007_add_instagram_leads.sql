-- Creating tables for Instagram lead generation
CREATE TABLE IF NOT EXISTS instagram_proxies (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    username TEXT,
    password TEXT,
    proxy_type TEXT DEFAULT 'http', -- Changed from type to proxy_type to avoid keywords
    is_working BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instagram_accounts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    proxy_id BIGINT REFERENCES instagram_proxies(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'active',
    last_used TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instagram_leads (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    instagram_username TEXT NOT NULL,
    full_name TEXT,
    bio TEXT,
    follower_count INTEGER,
    following_count INTEGER,
    is_private BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'discovered',
    discovery_keyword TEXT,
    data_audit_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, instagram_username)
);

-- Index for searching leads by keyword and status
CREATE INDEX IF NOT EXISTS idx_insta_leads_keyword ON instagram_leads(discovery_keyword);
CREATE INDEX IF NOT EXISTS idx_insta_leads_status ON instagram_leads(status);
CREATE INDEX IF NOT EXISTS idx_insta_leads_user ON instagram_leads(user_id);
