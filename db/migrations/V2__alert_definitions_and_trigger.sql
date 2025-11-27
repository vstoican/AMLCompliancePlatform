-- Alert definitions library and trigger-based evaluation on the transactions hypertable

CREATE TABLE IF NOT EXISTS alert_definitions (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'transaction_monitoring',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    severity TEXT NOT NULL DEFAULT 'medium',
    threshold_amount NUMERIC(16,2),
    window_minutes INTEGER,
    channels TEXT[],
    country_scope TEXT[],
    direction TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_alert_definition_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_alert_definitions_updated_at ON alert_definitions;
CREATE TRIGGER trg_alert_definitions_updated_at
    BEFORE UPDATE ON alert_definitions
    FOR EACH ROW
    EXECUTE FUNCTION set_alert_definition_updated_at();

ALTER TABLE alerts
    ADD COLUMN IF NOT EXISTS alert_definition_id INTEGER REFERENCES alert_definitions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_alerts_alert_definition_id ON alerts (alert_definition_id);

-- Seed baseline alert rules aligned with RO Law 129/2019 thresholds
INSERT INTO alert_definitions (code, name, description, category, severity, threshold_amount, window_minutes, channels, direction)
VALUES
    (
        'CASH_OVER_10K_EUR',
        'Cash ≥ EUR 10k',
        'Cash transactions at or above 10k EUR equivalent (Law 129/2019 cash threshold)',
        'transaction_monitoring',
        'high',
        10000,
        0,
        ARRAY['cash'],
        'domestic'
    ),
    (
        'EXTERNAL_TRANSFER_OVER_10K_EUR',
        'External transfer ≥ EUR 10k',
        'Cross-border/external transfers at or above 10k EUR equivalent (Law 129/2019 external transfer threshold)',
        'transaction_monitoring',
        'high',
        10000,
        0,
        ARRAY['wire', 'transfer'],
        'cross_border'
    ),
    (
        'REMITTANCE_OVER_2K_EUR',
        'Remittance ≥ EUR 2k',
        'Remittance/funds transfer at or above 2k EUR equivalent (Law 129/2019 remittance threshold)',
        'transaction_monitoring',
        'medium',
        2000,
        0,
        ARRAY['remittance', 'transfer'],
        'remittance'
    )
ON CONFLICT (code) DO NOTHING;

-- Trigger-based evaluator
CREATE OR REPLACE FUNCTION evaluate_transaction_alerts()
RETURNS TRIGGER AS $$
DECLARE
    def RECORD;
    customer_country TEXT;
    window_amount NUMERIC(16,2);
    triggered BOOLEAN;
BEGIN
    SELECT country INTO customer_country FROM customers WHERE id = NEW.customer_id;

    FOR def IN SELECT * FROM alert_definitions WHERE enabled LOOP
        triggered := FALSE;
        window_amount := NULL;

        IF def.channels IS NOT NULL AND array_length(def.channels, 1) > 0 THEN
            IF NEW.channel IS NULL OR NOT (NEW.channel = ANY(def.channels)) THEN
                CONTINUE;
            END IF;
        END IF;

        IF def.country_scope IS NOT NULL AND array_length(def.country_scope, 1) > 0 THEN
            IF NEW.country IS NULL OR NOT (NEW.country = ANY(def.country_scope)) THEN
                CONTINUE;
            END IF;
        END IF;

        IF def.direction = 'cross_border' THEN
            IF customer_country IS NULL OR NEW.country IS NULL OR NEW.country = customer_country THEN
                CONTINUE;
            END IF;
        END IF;

        IF def.threshold_amount IS NULL THEN
            CONTINUE;
        END IF;

        IF def.window_minutes IS NULL OR def.window_minutes <= 0 THEN
            triggered := (NEW.amount >= def.threshold_amount);
        ELSE
            SELECT COALESCE(SUM(amount), 0)
            INTO window_amount
            FROM transactions
            WHERE customer_id = NEW.customer_id
              AND occurred_at >= NEW.occurred_at - make_interval(mins => def.window_minutes)
              AND occurred_at <= NEW.occurred_at
              AND (def.channels IS NULL OR array_length(def.channels, 1) = 0 OR channel = ANY(def.channels));

            triggered := (window_amount >= def.threshold_amount);
        END IF;

        IF triggered THEN
            INSERT INTO alerts (customer_id, type, severity, scenario, details, alert_definition_id)
            VALUES (
                NEW.customer_id,
                def.category,
                def.severity,
                def.code,
                jsonb_build_object(
                    'definition_id', def.id,
                    'definition_code', def.code,
                    'definition_name', def.name,
                    'threshold_amount', def.threshold_amount,
                    'window_minutes', def.window_minutes,
                    'window_amount', window_amount,
                    'amount', NEW.amount,
                    'currency', NEW.currency,
                    'channel', NEW.channel,
                    'country', NEW.country,
                    'customer_country', customer_country,
                    'occurred_at', NEW.occurred_at
                ),
                def.id
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transactions_alerts ON transactions;
CREATE TRIGGER trg_transactions_alerts
    AFTER INSERT ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION evaluate_transaction_alerts();
