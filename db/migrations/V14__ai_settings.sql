-- AI Assistant Settings
-- Stores configuration for the AI assistant (provider, model, API key)

CREATE TABLE ai_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    encrypted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for fast lookups
CREATE INDEX idx_ai_settings_key ON ai_settings(setting_key);

-- Insert default settings
INSERT INTO ai_settings (setting_key, setting_value, encrypted) VALUES
    ('provider', 'anthropic', FALSE),
    ('model', 'claude-sonnet-4-20250514', FALSE),
    ('api_key', NULL, TRUE);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ai_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_settings_updated_at
    BEFORE UPDATE ON ai_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_settings_timestamp();
