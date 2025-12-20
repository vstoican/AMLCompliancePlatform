-- Add system user for workflow-generated notes and automated actions
-- V19: Create system user with known UUID

-- The password_hash is for a disabled account (cannot login - hash is for empty string)
-- bcrypt hash of 'SYSTEM_DISABLED_ACCOUNT' - this account should never be used for login
INSERT INTO users (id, email, full_name, role, is_active, password_hash)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'system@aml.local',
    'System',
    'admin',
    FALSE,  -- Inactive so it cannot be used for login
    '$2b$12$DISABLED.SYSTEM.ACCOUNT.HASH.DO.NOT.USE.FOR.LOGIN'
)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE users IS 'User accounts. UUID 00000000-0000-0000-0000-000000000001 is reserved for system/automated actions.';
