-- Create roles table for RBAC
CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '[]',
    color TEXT DEFAULT 'blue',
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create trigger for updated_at
CREATE TRIGGER trg_roles_updated
    BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Insert default system roles
INSERT INTO roles (id, name, description, permissions, color, is_system) VALUES
    ('admin', 'Administrator', 'Full system access and configuration',
     '["read:*", "write:*", "admin:*"]', 'red', TRUE),
    ('manager', 'Compliance Manager', 'Manage alerts, customers, and reports',
     '["read:customers", "write:customers", "read:alerts", "write:alerts", "read:transactions", "read:reports", "write:reports", "read:tasks", "write:tasks"]', 'amber', TRUE),
    ('senior_analyst', 'Senior Analyst', 'Review alerts, escalate issues, and mentor analysts',
     '["read:customers", "read:alerts", "write:alerts", "read:transactions", "read:tasks", "write:tasks"]', 'purple', TRUE),
    ('analyst', 'AML Analyst', 'Review alerts and customer profiles',
     '["read:customers", "read:alerts", "write:alerts", "read:tasks", "write:tasks"]', 'blue', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Add index for quick lookups
CREATE INDEX IF NOT EXISTS idx_roles_is_system ON roles(is_system);
