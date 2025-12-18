-- Task Status History for Audit Trail
-- Adds status change tracking to tasks (moving investigation history from alerts to tasks)

-- ============================================
-- 1. TASK STATUS HISTORY TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS task_status_history (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_status_history_task_id ON task_status_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_status_history_changed_by ON task_status_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_task_status_history_created_at ON task_status_history(created_at DESC);

-- ============================================
-- 2. STATUS CHANGE TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION log_task_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO task_status_history (task_id, previous_status, new_status, changed_by, reason)
        VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            COALESCE(NEW.assigned_to, NEW.claimed_by_id),
            CASE
                WHEN NEW.status = 'completed' THEN NEW.resolution_notes
                WHEN NEW.status = 'cancelled' THEN 'Task cancelled'
                ELSE NULL
            END
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_task_status_history ON tasks;
CREATE TRIGGER trg_task_status_history
    AFTER UPDATE OF status ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION log_task_status_change();

-- ============================================
-- 3. LOG INITIAL STATUS ON INSERT
-- ============================================

CREATE OR REPLACE FUNCTION log_task_initial_status()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO task_status_history (task_id, previous_status, new_status, changed_by, reason)
    VALUES (
        NEW.id,
        NULL,
        NEW.status,
        NEW.assigned_to,
        'Task created'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_task_initial_status ON tasks;
CREATE TRIGGER trg_task_initial_status
    AFTER INSERT ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION log_task_initial_status();

-- ============================================
-- 4. MIGRATE EXISTING ALERT NOTES TO TASKS
-- ============================================

-- Copy alert notes to their linked tasks
INSERT INTO task_notes (task_id, user_id, content, created_at, updated_at)
SELECT
    t.id as task_id,
    an.user_id,
    an.content,
    an.created_at,
    an.updated_at
FROM alert_notes an
JOIN tasks t ON t.alert_id = an.alert_id
WHERE NOT EXISTS (
    -- Avoid duplicates if migration runs multiple times
    SELECT 1 FROM task_notes tn
    WHERE tn.task_id = t.id
    AND tn.content = an.content
    AND tn.created_at = an.created_at
);

-- ============================================
-- 5. BACKFILL HISTORY FOR EXISTING TASKS
-- ============================================

-- Add initial history entry for existing tasks that don't have history yet
INSERT INTO task_status_history (task_id, previous_status, new_status, changed_by, reason, created_at)
SELECT
    t.id,
    NULL,
    COALESCE(t.status, 'pending'),
    t.assigned_to,
    'Initial state (backfilled)',
    t.created_at
FROM tasks t
WHERE NOT EXISTS (
    SELECT 1 FROM task_status_history tsh WHERE tsh.task_id = t.id
);
