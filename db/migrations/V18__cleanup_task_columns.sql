-- Cleanup task columns: remove deprecated claimed_by fields, drop cancelled status
-- V18: Standardize on assigned_to/assigned_at, remove cancelled status

-- ============================================
-- 1. DROP DEPRECATED COLUMNS
-- ============================================

-- Drop old claimed_by text column (superseded by assigned_to UUID)
ALTER TABLE tasks DROP COLUMN IF EXISTS claimed_by;

-- Drop old claimed_at column (superseded by assigned_at)
ALTER TABLE tasks DROP COLUMN IF EXISTS claimed_at;

-- Drop claimed_by_id column (superseded by assigned_to)
ALTER TABLE tasks DROP COLUMN IF EXISTS claimed_by_id;

-- Drop index on claimed_by if it exists
DROP INDEX IF EXISTS idx_tasks_claimed_by;
DROP INDEX IF EXISTS idx_tasks_claimed_by_id;

-- ============================================
-- 2. UPDATE STATUS CHECK CONSTRAINT
-- ============================================

-- Remove cancelled from valid statuses
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
    CHECK (status IN ('pending', 'in_progress', 'completed'));

-- Update any tasks with cancelled status to pending
UPDATE tasks SET status = 'pending' WHERE status = 'cancelled';

-- ============================================
-- 3. UPDATE TRIGGERS TO USE NEW COLUMN NAMES
-- ============================================

-- Update the alert close trigger to use assigned_to instead of claimed_by_id
CREATE OR REPLACE FUNCTION close_alert_on_task_completion()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger when status changes to 'completed'
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') AND NEW.alert_id IS NOT NULL THEN
        UPDATE alerts
        SET status = 'resolved',
            resolved_at = NOW(),
            resolved_by = COALESCE(
                (SELECT id FROM users WHERE id = NEW.assigned_to)::TEXT,
                NEW.completed_by,
                'system'
            ),
            resolution_notes = CASE
                WHEN resolution_notes IS NOT NULL AND resolution_notes != '' THEN
                    resolution_notes || E'\n\n[Task Completed] ' || COALESCE(NEW.resolution_notes, 'No notes')
                ELSE
                    '[Task Completed] ' || COALESCE(NEW.resolution_notes, 'No notes')
            END
        WHERE id = NEW.alert_id
          AND status NOT IN ('resolved');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. ADD COMMENTS
-- ============================================

COMMENT ON COLUMN tasks.assigned_to IS 'UUID of the user assigned to this task';
COMMENT ON COLUMN tasks.assigned_by IS 'UUID of the user who assigned the task';
COMMENT ON COLUMN tasks.assigned_at IS 'Timestamp when the task was assigned';
