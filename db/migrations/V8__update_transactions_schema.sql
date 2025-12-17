-- Drop existing transactions table and recreate with new schema
-- Note: This will delete all existing transaction data

DROP TABLE IF EXISTS transactions CASCADE;

CREATE TABLE transactions (
    id BIGSERIAL,
    surrogate_id TEXT NOT NULL,
    person_first_name TEXT NOT NULL,
    person_last_name TEXT NOT NULL,
    vendor_name TEXT,
    price_number_of_months INTEGER DEFAULT 1,
    grace_number_of_months INTEGER DEFAULT 0,
    original_transaction_amount NUMERIC(16,2) NOT NULL,
    amount NUMERIC(16,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    vendor_transaction_id TEXT,
    client_settlement_status TEXT DEFAULT 'unpaid',
    vendor_settlement_status TEXT DEFAULT 'unpaid',
    transaction_delivery_status TEXT DEFAULT 'PENDING',
    partial_delivery BOOLEAN DEFAULT FALSE,
    transaction_last_activity TEXT DEFAULT 'REGULAR',
    transaction_financial_status TEXT DEFAULT 'PENDING',
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    PRIMARY KEY (id, created_at)
);

-- Recreate hypertable for time-series data
SELECT create_hypertable('transactions', 'created_at', if_not_exists => TRUE);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_transactions_surrogate ON transactions (surrogate_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_vendor ON transactions (vendor_name);
CREATE INDEX IF NOT EXISTS idx_transactions_financial_status ON transactions (transaction_financial_status);
CREATE INDEX IF NOT EXISTS idx_transactions_settlement ON transactions (client_settlement_status, vendor_settlement_status);
