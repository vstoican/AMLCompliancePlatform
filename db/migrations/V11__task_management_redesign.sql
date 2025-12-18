-- Task Management System Redesign
-- Adds proper user management, task assignment, notes, attachments, and alert integration

-- ============================================
-- 1. USERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'analyst' CHECK (role IN ('analyst', 'senior_analyst', 'manager', 'admin')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users (is_active) WHERE is_active = TRUE;

-- Updated_at trigger for users
CREATE OR REPLACE FUNCTION set_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_users_updated_at();

-- Seed default users for development
INSERT INTO users (email, full_name, role) VALUES
    ('analyst@company.com', 'Default Analyst', 'analyst'),
    ('senior@company.com', 'Senior Analyst', 'senior_analyst'),
    ('manager@company.com', 'Compliance Manager', 'manager'),
    ('admin@company.com', 'System Administrator', 'admin')
ON CONFLICT (email) DO NOTHING;


-- ============================================
-- 2. TASKS TABLE UPDATES
-- ============================================

-- Add new columns for proper user assignment
ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS claimed_by_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_claimed_by_id ON tasks (claimed_by_id);

-- Migrate existing text claimed_by to UUID (best-effort based on email match)
UPDATE tasks t
SET claimed_by_id = u.id
FROM users u
WHERE t.claimed_by IS NOT NULL
  AND t.claimed_by = u.email
  AND t.claimed_by_id IS NULL;


-- ============================================
-- 3. TASK NOTES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS task_notes (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_notes_task_id ON task_notes (task_id);
CREATE INDEX IF NOT EXISTS idx_task_notes_user_id ON task_notes (user_id);
CREATE INDEX IF NOT EXISTS idx_task_notes_created_at ON task_notes (created_at DESC);

-- Updated_at trigger for task_notes
CREATE OR REPLACE FUNCTION set_task_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_task_notes_updated_at ON task_notes;
CREATE TRIGGER trg_task_notes_updated_at
    BEFORE UPDATE ON task_notes
    FOR EACH ROW
    EXECUTE FUNCTION set_task_notes_updated_at();


-- ============================================
-- 4. TASK ATTACHMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS task_attachments (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    content_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON task_attachments (task_id);
CREATE INDEX IF NOT EXISTS idx_task_attachments_user_id ON task_attachments (user_id);


-- ============================================
-- 5. ALERT AUTO-CLOSE TRIGGER
-- ============================================

-- Function to close alert when task is completed
CREATE OR REPLACE FUNCTION close_alert_on_task_completion()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger when status changes to 'completed'
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') AND NEW.alert_id IS NOT NULL THEN
        UPDATE alerts
        SET status = 'closed',
            resolved_at = NOW(),
            resolved_by = COALESCE(
                (SELECT email FROM users WHERE id = NEW.claimed_by_id),
                NEW.claimed_by,
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
          AND status NOT IN ('closed', 'dismissed');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_close_alert_on_task_complete ON tasks;
CREATE TRIGGER trg_close_alert_on_task_complete
    AFTER UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION close_alert_on_task_completion();


-- ============================================
-- 6. STATUS TRANSITION VALIDATION (optional enforcement)
-- ============================================

-- Comment: For now, we'll enforce transitions in the application layer
-- to allow flexibility. Uncomment below to enforce at DB level.

/*
CREATE OR REPLACE FUNCTION validate_task_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Define valid transitions
    IF OLD.status = 'completed' OR OLD.status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot change status of a % task', OLD.status;
    END IF;

    IF OLD.status = 'pending' AND NEW.status NOT IN ('in_progress', 'cancelled', 'pending') THEN
        RAISE EXCEPTION 'Invalid transition from pending to %', NEW.status;
    END IF;

    IF OLD.status = 'in_progress' AND NEW.status NOT IN ('completed', 'pending', 'cancelled', 'in_progress') THEN
        RAISE EXCEPTION 'Invalid transition from in_progress to %', NEW.status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_task_status ON tasks;
CREATE TRIGGER trg_validate_task_status
    BEFORE UPDATE OF status ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION validate_task_status_transition();
*/
