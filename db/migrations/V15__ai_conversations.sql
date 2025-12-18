-- AI Conversations Storage
-- Stores conversation history for the AI assistant per user

CREATE TABLE ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    messages JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(conversation_id)
);

-- Index for fast lookups
CREATE INDEX idx_ai_conversations_user ON ai_conversations(user_id);
CREATE INDEX idx_ai_conversations_conv_id ON ai_conversations(conversation_id);
CREATE INDEX idx_ai_conversations_updated ON ai_conversations(updated_at DESC);

-- Trigger to update updated_at timestamp
CREATE TRIGGER ai_conversations_updated_at
    BEFORE UPDATE ON ai_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_settings_timestamp();
