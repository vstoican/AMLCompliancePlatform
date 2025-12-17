-- Task Management Schema
-- V10: Tasks and Task Definitions tables with auto-creation trigger

-- =============================================================================
-- TASKS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS tasks (
    id BIGSERIAL PRIMARY KEY,

    -- Core references
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    alert_id BIGINT,  -- Reference to alerts (no FK due to hypertable)

    -- Task classification
    task_type TEXT NOT NULL CHECK (task_type IN (
        'investigation', 'kyc_refresh', 'document_request', 'escalation', 'sar_filing'
    )),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN (
        'low', 'medium', 'high', 'critical'
    )),

    -- Lifecycle
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'in_progress', 'completed', 'cancelled'
    )),

    -- Assignment (shared queue - anyone can claim)
    claimed_by TEXT,
    claimed_at TIMESTAMPTZ,

    -- Temporal workflow tracking
    workflow_id TEXT,
    workflow_run_id TEXT,
    workflow_status TEXT,

    -- Task details
    title TEXT NOT NULL,
    description TEXT,
    details JSONB DEFAULT '{}'::jsonb,

    -- Due date management
    due_date TIMESTAMPTZ,

    -- Resolution
    completed_at TIMESTAMPTZ,
    completed_by TEXT,
    resolution_notes TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT  -- 'system' for auto-created, username for manual
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks (priority);
CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON tasks (task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_customer_id ON tasks (customer_id);
CREATE INDEX IF NOT EXISTS idx_tasks_alert_id ON tasks (alert_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks (due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_claimed_by ON tasks (claimed_by);
CREATE INDEX IF NOT EXISTS idx_tasks_workflow_id ON tasks (workflow_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON tasks (status, priority);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION set_task_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION set_task_updated_at();

-- =============================================================================
-- TASK DEFINITIONS TABLE (Auto-creation rules)
-- =============================================================================
CREATE TABLE IF NOT EXISTS task_definitions (
    id SERIAL PRIMARY KEY,

    -- Mapping from alert to task
    alert_scenario TEXT NOT NULL,
    alert_severity TEXT[],  -- Optional: only trigger for these severities

    -- Task configuration
    task_type TEXT NOT NULL CHECK (task_type IN (
        'investigation', 'kyc_refresh', 'document_request', 'escalation', 'sar_filing'
    )),
    default_priority TEXT NOT NULL DEFAULT 'medium' CHECK (default_priority IN (
        'low', 'medium', 'high', 'critical'
    )),
    due_date_offset_hours INTEGER DEFAULT 48,

    -- Task template
    title_template TEXT NOT NULL,
    description_template TEXT,

    -- Control
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    auto_start_workflow BOOLEAN DEFAULT FALSE,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_task_def_scenario ON task_definitions (alert_scenario);
CREATE INDEX IF NOT EXISTS idx_task_def_enabled ON task_definitions (enabled);

-- Updated_at trigger for task_definitions
DROP TRIGGER IF EXISTS trg_task_definitions_updated_at ON task_definitions;
CREATE TRIGGER trg_task_definitions_updated_at
    BEFORE UPDATE ON task_definitions
    FOR EACH ROW
    EXECUTE FUNCTION set_task_updated_at();

-- =============================================================================
-- SEED DEFAULT TASK DEFINITIONS
-- =============================================================================
INSERT INTO task_definitions (alert_scenario, task_type, default_priority, due_date_offset_hours, title_template, description_template, auto_start_workflow)
VALUES
    ('CASH_OVER_10K_EUR', 'investigation', 'high', 24,
     'Investigation: Cash transaction >= 10K EUR',
     'High-value cash transaction requires compliance review per RO Law 129/2019. Review transaction details and customer profile.', false),

    ('EXTERNAL_TRANSFER_OVER_10K_EUR', 'investigation', 'high', 24,
     'Investigation: Cross-border transfer >= 10K EUR',
     'Large cross-border transfer requires enhanced due diligence review. Verify source of funds and beneficiary details.', false),

    ('HIGH_RISK_CUSTOMER_ACTIVITY', 'escalation', 'critical', 8,
     'URGENT: High-risk customer activity detected',
     'PEP or sanctions-flagged customer with transaction activity. Requires immediate senior review and potential SAR consideration.', false),

    ('LARGE_TRANSACTION_50K', 'investigation', 'critical', 12,
     'Investigation: Large transaction >= 50K EUR',
     'Very large transaction requires immediate compliance review. Document findings thoroughly.', false),

    ('VELOCITY_CHECK_1H', 'investigation', 'medium', 48,
     'Investigation: Velocity alert - rapid transactions',
     'Multiple transactions within 1-hour window exceeding threshold. Analyze transaction pattern for structuring indicators.', false),

    ('REMITTANCE_OVER_2K_EUR', 'investigation', 'medium', 48,
     'Investigation: Remittance over 2K EUR threshold',
     'Remittance transaction exceeds reporting threshold. Verify remittance purpose and recipient relationship.', false)
ON CONFLICT (alert_scenario) DO NOTHING;

-- =============================================================================
-- AUTO-CREATE TASK FROM ALERT TRIGGER
-- =============================================================================
CREATE OR REPLACE FUNCTION create_task_from_alert()
RETURNS TRIGGER AS $$
DECLARE
    def RECORD;
    customer_name TEXT;
    task_title TEXT;
    task_desc TEXT;
    amount_str TEXT;
BEGIN
    -- Find matching task definition
    SELECT * INTO def
    FROM task_definitions
    WHERE enabled = TRUE
      AND alert_scenario = NEW.scenario
      AND (alert_severity IS NULL OR NEW.severity = ANY(alert_severity));

    -- No matching definition - exit
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- Get customer name for template substitution
    SELECT COALESCE(first_name || ' ' || last_name, full_name, 'Unknown Customer')
    INTO customer_name
    FROM customers
    WHERE id = NEW.customer_id;

    -- Get amount from alert details
    amount_str := COALESCE((NEW.details->>'amount')::text, (NEW.details->>'window_amount')::text, 'N/A');

    -- Build title with template substitution
    task_title := def.title_template;
    task_title := REPLACE(task_title, '{scenario}', COALESCE(NEW.scenario, ''));
    task_title := REPLACE(task_title, '{customer_name}', COALESCE(customer_name, 'Unknown'));
    task_title := REPLACE(task_title, '{amount}', amount_str);

    -- Build description with template substitution
    task_desc := COALESCE(def.description_template, '');
    task_desc := REPLACE(task_desc, '{scenario}', COALESCE(NEW.scenario, ''));
    task_desc := REPLACE(task_desc, '{customer_name}', COALESCE(customer_name, 'Unknown'));
    task_desc := REPLACE(task_desc, '{amount}', amount_str);

    -- Create the task
    INSERT INTO tasks (
        customer_id,
        alert_id,
        task_type,
        priority,
        title,
        description,
        due_date,
        created_by,
        details
    )
    VALUES (
        NEW.customer_id,
        NEW.id,
        def.task_type,
        def.default_priority,
        task_title,
        task_desc,
        NOW() + make_interval(hours => def.due_date_offset_hours),
        'system',
        jsonb_build_object(
            'alert_scenario', NEW.scenario,
            'alert_severity', NEW.severity,
            'alert_details', NEW.details,
            'auto_created', true,
            'task_definition_id', def.id,
            'auto_start_workflow', def.auto_start_workflow
        )
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on alerts table
DROP TRIGGER IF EXISTS trg_alert_create_task ON alerts;
CREATE TRIGGER trg_alert_create_task
    AFTER INSERT ON alerts
    FOR EACH ROW
    EXECUTE FUNCTION create_task_from_alert();

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE tasks IS 'Compliance tasks created from alerts or manually by analysts';
COMMENT ON TABLE task_definitions IS 'Rules for auto-creating tasks from specific alert scenarios';
COMMENT ON COLUMN tasks.task_type IS 'Type: investigation, kyc_refresh, document_request, escalation, sar_filing';
COMMENT ON COLUMN tasks.priority IS 'Priority: low, medium, high, critical';
COMMENT ON COLUMN tasks.status IS 'Status: pending, in_progress, completed, cancelled';
COMMENT ON COLUMN tasks.claimed_by IS 'Username of analyst who claimed the task';
COMMENT ON COLUMN tasks.workflow_id IS 'Temporal workflow ID if workflow was started';
COMMENT ON COLUMN tasks.created_by IS 'system for auto-created tasks, username for manual tasks';
COMMENT ON COLUMN task_definitions.title_template IS 'Supports {scenario}, {customer_name}, {amount} placeholders';
