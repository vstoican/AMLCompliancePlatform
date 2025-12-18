-- Note: TimescaleDB hypertables require partitioning column in unique indexes
-- Creating a surrogate_id lookup table for deduplication

CREATE TABLE IF NOT EXISTS transaction_lookup (
    surrogate_id TEXT PRIMARY KEY,
    transaction_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_transaction_lookup_created
    ON transaction_lookup (created_at DESC);

-- Cleanup old entries (optional - run periodically)
-- DELETE FROM transaction_lookup WHERE created_at < NOW() - INTERVAL '7 days';
