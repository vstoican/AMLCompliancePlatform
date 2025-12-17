-- Additional alert definitions for comprehensive AML monitoring

INSERT INTO alert_definitions (code, name, description, category, severity, threshold_amount, window_minutes, channels, direction)
VALUES
    (
        'VELOCITY_CHECK_1H',
        'Velocity ≥ EUR 5k in 1h',
        'Multiple transactions totaling 5k EUR or more within a 1-hour window (velocity monitoring)',
        'transaction_monitoring',
        'medium',
        5000,
        60,
        ARRAY['card', 'app', 'wire', 'transfer'],
        NULL
    ),
    (
        'LARGE_TRANSACTION_50K',
        'Single transaction ≥ EUR 50k',
        'Individual transaction at or above 50k EUR (large transaction monitoring)',
        'transaction_monitoring',
        'high',
        50000,
        0,
        NULL,
        NULL
    ),
    (
        'HIGH_RISK_CUSTOMER_ACTIVITY',
        'High-risk customer activity ≥ EUR 1k',
        'Transaction from PEP or sanctions-flagged customer above 1k EUR (enhanced due diligence)',
        'transaction_monitoring',
        'critical',
        1000,
        0,
        NULL,
        NULL
    )
ON CONFLICT (code) DO NOTHING;

-- Mark these as system defaults
UPDATE alert_definitions
SET is_system_default = TRUE
WHERE code IN ('VELOCITY_CHECK_1H', 'LARGE_TRANSACTION_50K', 'HIGH_RISK_CUSTOMER_ACTIVITY');
