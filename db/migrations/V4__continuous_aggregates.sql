-- V4: Continuous Aggregates for Real-Time Transaction Metrics
-- This migration creates TimescaleDB continuous aggregates (materialized views)
-- that automatically maintain pre-computed metrics for efficient querying

-- =============================================================================
-- 0. CONVERT TRANSACTIONS TABLE TO HYPERTABLE (IF NOT ALREADY)
-- =============================================================================
-- This is required before creating continuous aggregates
-- Note: This should have been done in V1, but if it was baselined, we do it here

-- Check if transactions is already a hypertable, if not convert it
DO $$
DECLARE
    is_hypertable BOOLEAN;
BEGIN
    -- Check if already a hypertable
    SELECT EXISTS (
        SELECT 1 FROM timescaledb_information.hypertables
        WHERE hypertable_name = 'transactions'
    ) INTO is_hypertable;

    IF is_hypertable THEN
        RAISE NOTICE 'Transactions table is already a hypertable, skipping conversion';
    ELSE
        RAISE NOTICE 'Converting transactions table to hypertable...';

        -- Drop existing primary key constraint (doesn't include partitioning column)
        ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_pkey;

        -- Create new composite primary key that includes the partitioning column
        -- This is required for hypertables partitioned by time
        ALTER TABLE transactions ADD PRIMARY KEY (id, occurred_at);

        -- Now convert to hypertable
        PERFORM create_hypertable('transactions', 'occurred_at',
                                  migrate_data => TRUE);

        RAISE NOTICE 'Successfully converted transactions table to hypertable';
    END IF;
END $$;

-- Verify hypertable was created
DO $$
DECLARE
    hypertable_count INT;
BEGIN
    SELECT COUNT(*) INTO hypertable_count
    FROM timescaledb_information.hypertables
    WHERE hypertable_name = 'transactions';

    IF hypertable_count = 0 THEN
        RAISE EXCEPTION 'Failed to create hypertable for transactions table';
    END IF;

    RAISE NOTICE 'Hypertable verification passed';
END $$;

-- =============================================================================
-- 1. HOURLY TRANSACTION METRICS PER CUSTOMER
-- =============================================================================
-- Purpose: Real-time aggregation of transaction volume, amounts, and patterns
-- Use cases: Alert thresholds, velocity checks, pattern detection
-- Refresh: Every 10 minutes, includes last hour of real-time data

CREATE MATERIALIZED VIEW transactions_hourly
WITH (timescaledb.continuous) AS
SELECT
    customer_id,
    time_bucket('1 hour', occurred_at) AS bucket,

    -- Volume metrics
    COUNT(*) as transaction_count,

    -- Amount metrics
    SUM(amount) as total_amount,
    AVG(amount) as avg_amount,
    MIN(amount) as min_amount,
    MAX(amount) as max_amount,

    -- High-value transaction counts
    COUNT(*) FILTER (WHERE amount >= 10000) as high_value_count,
    SUM(amount) FILTER (WHERE amount >= 10000) as high_value_total,

    -- Channel distribution
    COUNT(*) FILTER (WHERE channel = 'CASH') as cash_count,
    COUNT(*) FILTER (WHERE channel = 'WIRE') as wire_count,
    COUNT(*) FILTER (WHERE channel = 'CARD') as card_count,

    -- Geographic diversity
    COUNT(DISTINCT country) as unique_countries,
    COUNT(*) FILTER (WHERE country IS NOT NULL AND country != 'NL') as cross_border_count,
    SUM(amount) FILTER (WHERE country IS NOT NULL AND country != 'NL') as cross_border_amount,

    -- Merchant diversity
    COUNT(DISTINCT merchant_category) as unique_merchants

FROM transactions
GROUP BY customer_id, bucket
WITH NO DATA;

-- Enable real-time aggregation (includes non-materialized recent data)
ALTER MATERIALIZED VIEW transactions_hourly SET (timescaledb.materialized_only = false);

-- Create refresh policy: refresh every 10 minutes for data older than 1 hour
SELECT add_continuous_aggregate_policy('transactions_hourly',
    start_offset => INTERVAL '7 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '10 minutes');

-- Index for fast customer lookups
CREATE INDEX idx_transactions_hourly_customer_bucket
ON transactions_hourly (customer_id, bucket DESC);

-- Index for time-based queries
CREATE INDEX idx_transactions_hourly_bucket
ON transactions_hourly (bucket DESC);

-- =============================================================================
-- 2. DAILY CUSTOMER ACTIVITY SUMMARY
-- =============================================================================
-- Purpose: Daily rollup for trend analysis and compliance reporting
-- Use cases: Weekly/monthly reports, customer risk scoring, pattern analysis
-- Refresh: Every hour, includes last 24 hours of real-time data

CREATE MATERIALIZED VIEW customer_daily_summary
WITH (timescaledb.continuous) AS
SELECT
    customer_id,
    time_bucket('1 day', occurred_at) AS day,

    -- Daily activity metrics
    COUNT(*) as daily_transaction_count,
    SUM(amount) as daily_total_amount,
    AVG(amount) as daily_avg_amount,
    MAX(amount) as daily_max_amount,

    -- Risk indicators
    COUNT(*) FILTER (WHERE amount >= 10000) as daily_high_value_count,
    COUNT(DISTINCT country) as daily_countries,
    COUNT(DISTINCT channel) as daily_channels,
    COUNT(DISTINCT merchant_category) as daily_merchants,

    -- Channel breakdown
    COALESCE(SUM(amount) FILTER (WHERE channel = 'CASH'), 0) as daily_cash_amount,
    COALESCE(SUM(amount) FILTER (WHERE channel = 'WIRE'), 0) as daily_wire_amount,
    COALESCE(SUM(amount) FILTER (WHERE channel = 'CARD'), 0) as daily_card_amount,

    -- Cross-border activity
    COUNT(*) FILTER (WHERE country IS NOT NULL AND country != 'NL') as daily_cross_border_count,
    COALESCE(SUM(amount) FILTER (WHERE country IS NOT NULL AND country != 'NL'), 0) as daily_cross_border_amount

FROM transactions
GROUP BY customer_id, day
WITH NO DATA;

-- Enable real-time aggregation
ALTER MATERIALIZED VIEW customer_daily_summary SET (timescaledb.materialized_only = false);

-- Create refresh policy: refresh every hour for data older than 24 hours
SELECT add_continuous_aggregate_policy('customer_daily_summary',
    start_offset => INTERVAL '30 days',
    end_offset => INTERVAL '24 hours',
    schedule_interval => INTERVAL '1 hour');

-- Indexes for efficient querying
CREATE INDEX idx_customer_daily_customer_day
ON customer_daily_summary (customer_id, day DESC);

CREATE INDEX idx_customer_daily_day
ON customer_daily_summary (day DESC);

-- Index for risk-based queries (customers with high activity)
CREATE INDEX idx_customer_daily_high_value
ON customer_daily_summary (day DESC, daily_high_value_count)
WHERE daily_high_value_count > 0;

-- =============================================================================
-- 3. GLOBAL TRANSACTION METRICS (SYSTEM-WIDE)
-- =============================================================================
-- Purpose: Platform-wide monitoring and anomaly detection
-- Use cases: System health, trend analysis, regulatory reporting
-- Refresh: Every 15 minutes

CREATE MATERIALIZED VIEW global_hourly_metrics
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', occurred_at) AS bucket,

    -- Overall volume
    COUNT(*) as total_transactions,
    COUNT(DISTINCT customer_id) as active_customers,

    -- Amount statistics
    SUM(amount) as total_volume,
    AVG(amount) as avg_transaction_amount,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount) as median_amount,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY amount) as p95_amount,
    MAX(amount) as max_amount,

    -- Risk indicators
    COUNT(*) FILTER (WHERE amount >= 10000) as high_value_transactions,
    SUM(amount) FILTER (WHERE amount >= 10000) as high_value_volume,

    -- Channel distribution
    COUNT(*) FILTER (WHERE channel = 'CASH') as cash_transactions,
    COUNT(*) FILTER (WHERE channel = 'WIRE') as wire_transactions,
    COUNT(*) FILTER (WHERE channel = 'CARD') as card_transactions,

    -- Geographic distribution
    COUNT(DISTINCT country) as unique_countries,
    COUNT(*) FILTER (WHERE country IS NOT NULL AND country != 'NL') as cross_border_transactions,

    -- Currency distribution
    COUNT(DISTINCT currency) as unique_currencies,
    COUNT(*) FILTER (WHERE currency != 'EUR') as non_eur_transactions

FROM transactions
GROUP BY bucket
WITH NO DATA;

-- Enable real-time aggregation
ALTER MATERIALIZED VIEW global_hourly_metrics SET (timescaledb.materialized_only = false);

-- Create refresh policy: refresh every 15 minutes
SELECT add_continuous_aggregate_policy('global_hourly_metrics',
    start_offset => INTERVAL '7 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '15 minutes');

-- Index for time-based queries
CREATE INDEX idx_global_hourly_bucket
ON global_hourly_metrics (bucket DESC);

-- =============================================================================
-- 4. CONVERT ALERTS TABLE TO HYPERTABLE (FOR ALERT METRICS)
-- =============================================================================
-- Convert alerts table to hypertable to enable continuous aggregates on it

DO $$
DECLARE
    is_hypertable BOOLEAN;
BEGIN
    -- Check if already a hypertable
    SELECT EXISTS (
        SELECT 1 FROM timescaledb_information.hypertables
        WHERE hypertable_name = 'alerts'
    ) INTO is_hypertable;

    IF is_hypertable THEN
        RAISE NOTICE 'Alerts table is already a hypertable, skipping conversion';
    ELSE
        RAISE NOTICE 'Converting alerts table to hypertable...';

        -- Drop existing primary key constraint
        ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_pkey;

        -- Create new composite primary key that includes the partitioning column
        ALTER TABLE alerts ADD PRIMARY KEY (id, created_at);

        -- Convert to hypertable
        PERFORM create_hypertable('alerts', 'created_at',
                                  migrate_data => TRUE);

        RAISE NOTICE 'Successfully converted alerts table to hypertable';
    END IF;
END $$;

-- =============================================================================
-- 5. ALERT FREQUENCY METRICS
-- =============================================================================
-- Purpose: Monitor alert generation rates and definition effectiveness
-- Use cases: Alert tuning, false positive analysis, compliance reporting
-- Refresh: Every 30 minutes

CREATE MATERIALIZED VIEW alert_hourly_stats
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', created_at) AS bucket,
    alert_definition_id,
    severity,

    -- Alert volume
    COUNT(*) as alert_count,
    COUNT(DISTINCT customer_id) as affected_customers,

    -- Status distribution
    COUNT(*) FILTER (WHERE status = 'OPEN') as open_count,
    COUNT(*) FILTER (WHERE status = 'INVESTIGATING') as investigating_count,
    COUNT(*) FILTER (WHERE status = 'ESCALATED') as escalated_count,
    COUNT(*) FILTER (WHERE status = 'CLOSED') as closed_count,
    COUNT(*) FILTER (WHERE status = 'FALSE_POSITIVE') as false_positive_count

FROM alerts
GROUP BY bucket, alert_definition_id, severity
WITH NO DATA;

-- Enable real-time aggregation
ALTER MATERIALIZED VIEW alert_hourly_stats SET (timescaledb.materialized_only = false);

-- Create refresh policy: refresh every 30 minutes
SELECT add_continuous_aggregate_policy('alert_hourly_stats',
    start_offset => INTERVAL '30 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '30 minutes');

-- Indexes for efficient querying
CREATE INDEX idx_alert_hourly_bucket
ON alert_hourly_stats (bucket DESC);

CREATE INDEX idx_alert_hourly_def_bucket
ON alert_hourly_stats (alert_definition_id, bucket DESC);

CREATE INDEX idx_alert_hourly_severity
ON alert_hourly_stats (severity, bucket DESC);

-- =============================================================================
-- 6. UTILITY VIEWS FOR COMMON QUERIES
-- =============================================================================

-- Recent customer activity (last 24 hours) - frequently used for dashboards
CREATE OR REPLACE VIEW customer_recent_activity AS
SELECT
    c.id as customer_id,
    c.full_name,
    c.risk_level,
    c.risk_score,
    COALESCE(th.transaction_count, 0) as last_24h_transactions,
    COALESCE(th.total_amount, 0) as last_24h_volume,
    COALESCE(th.high_value_count, 0) as last_24h_high_value,
    COALESCE(th.unique_countries, 0) as last_24h_countries,
    COALESCE(a.recent_alerts, 0) as last_24h_alerts
FROM customers c
LEFT JOIN LATERAL (
    SELECT
        SUM(transaction_count) as transaction_count,
        SUM(total_amount) as total_amount,
        SUM(high_value_count) as high_value_count,
        MAX(unique_countries) as unique_countries
    FROM transactions_hourly
    WHERE customer_id = c.id
      AND bucket >= NOW() - INTERVAL '24 hours'
) th ON true
LEFT JOIN LATERAL (
    SELECT COUNT(*) as recent_alerts
    FROM alerts
    WHERE customer_id = c.id
      AND created_at >= NOW() - INTERVAL '24 hours'
      AND status IN ('OPEN', 'INVESTIGATING', 'ESCALATED')
) a ON true;

-- High-risk customers view (combines transaction patterns with risk scores)
CREATE OR REPLACE VIEW high_risk_customers_summary AS
SELECT
    c.id as customer_id,
    c.full_name,
    c.email,
    c.risk_level,
    c.risk_score,
    c.pep_flag,
    c.sanctions_hit,
    cds.daily_transaction_count,
    cds.daily_total_amount,
    cds.daily_high_value_count,
    cds.daily_countries,
    cds.daily_cross_border_amount
FROM customers c
JOIN customer_daily_summary cds ON c.id = cds.customer_id
WHERE cds.day = CURRENT_DATE
  AND (
    c.risk_level IN ('medium', 'high')
    OR cds.daily_high_value_count > 3
    OR cds.daily_countries > 5
    OR cds.daily_cross_border_amount > 50000
  )
ORDER BY c.risk_score DESC, cds.daily_total_amount DESC;

-- =============================================================================
-- DOCUMENTATION
-- =============================================================================
-- NOTE: TimescaleDB continuous aggregates cannot have COMMENTs added via
-- standard PostgreSQL COMMENT syntax. Documentation is maintained here:
--
-- transactions_hourly:
--   Continuous aggregate: Hourly transaction metrics per customer.
--   Refreshes every 10 minutes. Used for real-time velocity checks and alert thresholds.
--
-- customer_daily_summary:
--   Continuous aggregate: Daily customer activity rollup.
--   Refreshes every hour. Used for trend analysis and compliance reporting.
--
-- global_hourly_metrics:
--   Continuous aggregate: Platform-wide transaction metrics.
--   Refreshes every 15 minutes. Used for system monitoring and anomaly detection.
--
-- alert_hourly_stats:
--   Continuous aggregate: Alert generation statistics.
--   Refreshes every 30 minutes. Used for alert tuning and effectiveness analysis.
--
-- customer_recent_activity (regular view):
--   Shows customer activity for the last 24 hours.
--   Combines customer master data with recent transaction metrics.
--
-- high_risk_customers_summary (regular view):
--   Identifies customers with high-risk patterns based on today's activity and risk scores.
