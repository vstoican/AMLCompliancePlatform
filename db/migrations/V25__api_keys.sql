-- API Keys table for programmatic access
CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,  -- First 8 chars for display (e.g., "sk_live_Ab")
    key_hash TEXT NOT NULL,    -- Bcrypt hash of the full key
    scopes JSONB DEFAULT '["read"]',  -- Permissions: read, write, admin
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,    -- NULL means never expires
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast key lookup
CREATE INDEX idx_api_keys_key_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE is_active = TRUE;

-- Trigger to update updated_at
CREATE TRIGGER trg_api_keys_updated
    BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add comment
COMMENT ON TABLE api_keys IS 'API keys for programmatic access to the platform';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 8 characters of the key for identification';
COMMENT ON COLUMN api_keys.key_hash IS 'Bcrypt hash of the full API key';
COMMENT ON COLUMN api_keys.scopes IS 'Array of permission scopes: read, write, admin';
