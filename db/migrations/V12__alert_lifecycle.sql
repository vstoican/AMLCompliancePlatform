-- Alert Lifecycle Management System
-- Adds assignment, notes, attachments, and status history to alerts

-- ============================================
-- 1. EXTEND ALERTS TABLE
-- ============================================

ALTER TABLE alerts
    ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS escalated_to UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS escalated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS escalation_reason TEXT,
    ADD COLUMN IF NOT EXISTS resolution_type TEXT,
    ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium',
    ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;

-- MIGRATE EXISTING STATUSES FIRST (before adding constraint)
-- Map old statuses to new statuses
UPDATE alerts SET status = 'resolved' WHERE status IN ('closed', 'dismissed');
UPDATE alerts SET status = 'in_progress' WHERE status = 'investigating';

-- Add check constraint for valid statuses
-- Statuses: open, assigned, in_progress, escalated, on_hold, resolved
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS chk_alert_status;
ALTER TABLE alerts ADD CONSTRAINT chk_alert_status
    CHECK (status IN ('open', 'assigned', 'in_progress', 'escalated', 'on_hold', 'resolved'));

-- Add check constraint for valid resolution types
ALTER TABLE alerts ADD CONSTRAINT chk_alert_resolution_type
    CHECK (resolution_type IS NULL OR resolution_type IN ('confirmed_suspicious', 'false_positive', 'not_suspicious', 'duplicate', 'other'));

-- Add check constraint for valid priorities
ALTER TABLE alerts ADD CONSTRAINT chk_alert_priority
    CHECK (priority IN ('low', 'medium', 'high', 'critical'));

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_alerts_assigned_to ON alerts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_alerts_escalated_to ON alerts(escalated_to);
CREATE INDEX IF NOT EXISTS idx_alerts_priority ON alerts(priority);
CREATE INDEX IF NOT EXISTS idx_alerts_resolution_type ON alerts(resolution_type);

-- ============================================
-- 2. ALERT NOTES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS alert_notes (
    id BIGSERIAL PRIMARY KEY,
    alert_id BIGINT NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    note_type TEXT NOT NULL DEFAULT 'comment',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_alert_note_type CHECK (note_type IN ('comment', 'status_change', 'escalation', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_alert_notes_alert_id ON alert_notes(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_notes_user_id ON alert_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_notes_created_at ON alert_notes(created_at DESC);

-- Updated_at trigger for alert_notes
CREATE OR REPLACE FUNCTION set_alert_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_alert_notes_updated_at ON alert_notes;
CREATE TRIGGER trg_alert_notes_updated_at
    BEFORE UPDATE ON alert_notes
    FOR EACH ROW
    EXECUTE FUNCTION set_alert_notes_updated_at();

-- ============================================
-- 3. ALERT ATTACHMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS alert_attachments (
    id BIGSERIAL PRIMARY KEY,
    alert_id BIGINT NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    content_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_attachments_alert_id ON alert_attachments(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_attachments_user_id ON alert_attachments(user_id);

-- ============================================
-- 4. ALERT STATUS HISTORY TABLE (Audit Trail)
-- ============================================

CREATE TABLE IF NOT EXISTS alert_status_history (
    id BIGSERIAL PRIMARY KEY,
    alert_id BIGINT NOT NULL,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_status_history_alert_id ON alert_status_history(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_status_history_changed_by ON alert_status_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_alert_status_history_created_at ON alert_status_history(created_at DESC);

-- ============================================
-- 5. STATUS CHANGE TRIGGER
-- ============================================

-- Note: We'll log status changes via Temporal activities for better control
-- This trigger is a backup for direct DB updates

CREATE OR REPLACE FUNCTION log_alert_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO alert_status_history (alert_id, previous_status, new_status, changed_by, reason)
        VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            NEW.assigned_to,  -- Best guess at who made the change
            CASE
                WHEN NEW.status = 'resolved' THEN NEW.resolution_notes
                WHEN NEW.status = 'escalated' THEN NEW.escalation_reason
                ELSE NULL
            END
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_alert_status_history ON alerts;
CREATE TRIGGER trg_alert_status_history
    AFTER UPDATE OF status ON alerts
    FOR EACH ROW
    EXECUTE FUNCTION log_alert_status_change();
