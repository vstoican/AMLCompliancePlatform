-- Add scheduled sanctions screening workflow definition
-- This runs daily to check all customers against sanctions lists

INSERT INTO workflow_definitions (
    code, name, description, workflow_type, schedule_type, cron_expression,
    parameters, create_alert, alert_severity, create_task, is_system_default
) VALUES
    (
        'sanctions_screening_scheduled',
        'Scheduled Sanctions Screening',
        'Daily batch screening of all customers against sanctions lists',
        'sanctions_screening',
        'cron',
        '0 3 * * *',  -- Daily at 3am
        '{
            "batch_size": 100,
            "screening_lists": ["ofac", "eu", "un"],
            "api_endpoint": "/api/v1/sanctions/search"
        }'::jsonb,
        TRUE,
        'critical',
        TRUE,
        TRUE
    )
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    schedule_type = EXCLUDED.schedule_type,
    cron_expression = EXCLUDED.cron_expression,
    parameters = EXCLUDED.parameters,
    updated_at = NOW();

-- Update the existing event-based sanctions screening description
UPDATE workflow_definitions
SET description = 'Real-time sanctions screening triggered on customer creation or update (single customer mode)'
WHERE code = 'sanctions_screening_default';
