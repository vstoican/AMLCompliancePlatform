-- Workflow Definitions Management
-- Allows users to create, configure, and manage workflow definitions

-- =============================================================================
-- WORKFLOW DEFINITIONS TABLE
-- =============================================================================

CREATE TABLE workflow_definitions (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    workflow_type TEXT NOT NULL,  -- 'kyc_refresh', 'sanctions_screening', 'investigation', etc.

    -- Scheduling
    schedule_type TEXT CHECK (schedule_type IN ('cron', 'event', 'manual')) DEFAULT 'manual',
    cron_expression TEXT,         -- e.g., '0 2 * * *' (daily at 2am)
    trigger_event TEXT,           -- e.g., 'customer.created', 'document.expiring'

    -- Configuration (JSONB for flexibility)
    parameters JSONB DEFAULT '{}',

    -- Actions
    create_alert BOOLEAN DEFAULT FALSE,
    alert_severity TEXT DEFAULT 'medium' CHECK (alert_severity IN ('low', 'medium', 'high', 'critical')),
    create_task BOOLEAN DEFAULT FALSE,
    task_type TEXT,
    task_priority TEXT DEFAULT 'medium' CHECK (task_priority IN ('low', 'medium', 'high', 'critical')),

    -- Execution settings
    timeout_seconds INTEGER DEFAULT 3600,
    retry_max_attempts INTEGER DEFAULT 3,
    retry_backoff_seconds INTEGER DEFAULT 60,

    -- Metadata
    enabled BOOLEAN DEFAULT TRUE,
    is_system_default BOOLEAN DEFAULT FALSE,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for enabled workflow lookups
CREATE INDEX idx_workflow_definitions_enabled ON workflow_definitions(enabled) WHERE enabled = TRUE;
CREATE INDEX idx_workflow_definitions_schedule ON workflow_definitions(schedule_type) WHERE enabled = TRUE;
CREATE INDEX idx_workflow_definitions_type ON workflow_definitions(workflow_type);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION set_workflow_definitions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workflow_definitions_updated_at ON workflow_definitions;
CREATE TRIGGER trg_workflow_definitions_updated_at
    BEFORE UPDATE ON workflow_definitions
    FOR EACH ROW
    EXECUTE FUNCTION set_workflow_definitions_updated_at();

-- =============================================================================
-- WORKFLOW EXECUTIONS TABLE (History)
-- =============================================================================

CREATE TABLE workflow_executions (
    id SERIAL PRIMARY KEY,
    workflow_definition_id INTEGER REFERENCES workflow_definitions(id) ON DELETE SET NULL,
    workflow_definition_code TEXT,  -- Denormalized for history even if definition is deleted
    temporal_workflow_id TEXT,
    temporal_run_id TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    result JSONB,
    error TEXT,
    triggered_by TEXT CHECK (triggered_by IN ('schedule', 'event', 'manual', 'api')),
    triggered_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    parameters_used JSONB  -- Snapshot of parameters at execution time
);

CREATE INDEX idx_workflow_executions_definition ON workflow_executions(workflow_definition_id);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX idx_workflow_executions_started ON workflow_executions(started_at DESC);

-- =============================================================================
-- SEED SYSTEM DEFAULT WORKFLOW DEFINITIONS
-- =============================================================================

INSERT INTO workflow_definitions (
    code, name, description, workflow_type, schedule_type, cron_expression,
    parameters, create_alert, create_task, task_type, is_system_default
) VALUES
    (
        'kyc_refresh_default',
        'KYC Refresh',
        'Periodic customer KYC verification based on document expiry dates',
        'kyc_refresh',
        'cron',
        '0 2 * * *',  -- Daily at 2am
        '{
            "check_fields": ["document_date_of_expire"],
            "days_before_expiry": 365,
            "customer_filters": {
                "statuses": ["active"]
            },
            "batch_size": 100
        }'::jsonb,
        FALSE,
        TRUE,
        'kyc_refresh',
        TRUE
    ),
    (
        'sanctions_screening_default',
        'Sanctions Screening',
        'Real-time sanctions screening triggered on customer creation or update',
        'sanctions_screening',
        'event',
        NULL,
        '{
            "trigger_on": ["customer.created", "customer.updated"],
            "screening_lists": ["ofac", "eu", "un"],
            "match_threshold": 0.85
        }'::jsonb,
        TRUE,
        FALSE,
        NULL,
        TRUE
    ),
    (
        'investigation_workflow',
        'Investigation',
        'Manual investigation workflow for complex cases',
        'investigation',
        'manual',
        NULL,
        '{
            "require_approval": true,
            "escalation_threshold_days": 7
        }'::jsonb,
        FALSE,
        TRUE,
        'investigation',
        TRUE
    ),
    (
        'document_request_workflow',
        'Document Request',
        'Workflow for requesting additional documents from customers',
        'document_request',
        'manual',
        NULL,
        '{
            "reminder_days": [3, 7, 14],
            "auto_escalate_days": 21
        }'::jsonb,
        FALSE,
        TRUE,
        'document_request',
        TRUE
    ),
    (
        'escalation_workflow',
        'Escalation',
        'Workflow for escalating cases to senior analysts or management',
        'escalation',
        'manual',
        NULL,
        '{
            "escalation_levels": ["senior_analyst", "manager", "compliance_officer"]
        }'::jsonb,
        TRUE,
        TRUE,
        'escalation',
        TRUE
    ),
    (
        'sar_filing_workflow',
        'SAR Filing',
        'Suspicious Activity Report filing workflow',
        'sar_filing',
        'manual',
        NULL,
        '{
            "require_dual_approval": true,
            "filing_deadline_days": 30
        }'::jsonb,
        TRUE,
        TRUE,
        'sar_filing',
        TRUE
    )
ON CONFLICT (code) DO NOTHING;
