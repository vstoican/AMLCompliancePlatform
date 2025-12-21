-- Create update_updated_at function if not exists
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Company settings table (single row for organization settings)
CREATE TABLE IF NOT EXISTS company_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- Ensures single row
    -- Company Details
    company_name TEXT NOT NULL DEFAULT 'AML Compliance Platform',
    registration_number TEXT,
    address_line1 TEXT,
    city TEXT,
    postal_code TEXT,
    country TEXT,
    -- Contact Information
    contact_email TEXT,
    contact_phone TEXT,
    website TEXT,
    -- Compliance Officer
    compliance_officer_name TEXT,
    compliance_officer_email TEXT,
    compliance_officer_phone TEXT,
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default row
INSERT INTO company_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Trigger to update updated_at
CREATE TRIGGER trg_company_settings_updated
    BEFORE UPDATE ON company_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
