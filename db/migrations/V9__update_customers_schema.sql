-- Update customers table with new comprehensive schema
-- This migration adds all required customer fields

-- Add new columns to customers table
ALTER TABLE customers
    -- Basic Info
    ADD COLUMN IF NOT EXISTS member_id TEXT,
    ADD COLUMN IF NOT EXISTS first_name TEXT,
    ADD COLUMN IF NOT EXISTS last_name TEXT,
    ADD COLUMN IF NOT EXISTS phone_number TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS application_time TIMESTAMPTZ,

    -- Personal Details
    ADD COLUMN IF NOT EXISTS birth_date DATE,
    ADD COLUMN IF NOT EXISTS identity_number TEXT,
    ADD COLUMN IF NOT EXISTS place_of_birth TEXT,
    ADD COLUMN IF NOT EXISTS country_of_birth TEXT,

    -- Address
    ADD COLUMN IF NOT EXISTS address_county TEXT,
    ADD COLUMN IF NOT EXISTS address_city TEXT,
    ADD COLUMN IF NOT EXISTS address_street TEXT,
    ADD COLUMN IF NOT EXISTS address_house_number TEXT,
    ADD COLUMN IF NOT EXISTS address_block_number TEXT,
    ADD COLUMN IF NOT EXISTS address_entrance TEXT,
    ADD COLUMN IF NOT EXISTS address_apartment TEXT,

    -- Employment
    ADD COLUMN IF NOT EXISTS employer_name TEXT,

    -- Document Info
    ADD COLUMN IF NOT EXISTS document_type TEXT,
    ADD COLUMN IF NOT EXISTS document_id TEXT,
    ADD COLUMN IF NOT EXISTS document_issuer TEXT,
    ADD COLUMN IF NOT EXISTS document_date_of_expire DATE,
    ADD COLUMN IF NOT EXISTS document_date_of_issue DATE,

    -- Financial/Credit Limits
    ADD COLUMN IF NOT EXISTS leanpay_monthly_repayment NUMERIC(16,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS available_monthly_credit_limit NUMERIC(16,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS available_exposure NUMERIC(16,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS limit_exposure_last_update TIMESTAMPTZ,

    -- Validation & Consent
    ADD COLUMN IF NOT EXISTS data_validated TEXT DEFAULT 'NOT VALIDATED',
    ADD COLUMN IF NOT EXISTS marketing_consent TEXT DEFAULT 'NOT SET',
    ADD COLUMN IF NOT EXISTS marketing_consent_last_modified TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS kyc_motion_consent_given BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS kyc_motion_consent_date TIMESTAMPTZ;

-- Migrate existing full_name to first_name/last_name if not already split
UPDATE customers
SET first_name = split_part(full_name, ' ', 1),
    last_name = CASE
        WHEN position(' ' in full_name) > 0
        THEN substring(full_name from position(' ' in full_name) + 1)
        ELSE ''
    END
WHERE first_name IS NULL AND full_name IS NOT NULL;

-- Migrate existing id_document_expiry to document_date_of_expire
UPDATE customers
SET document_date_of_expire = id_document_expiry
WHERE document_date_of_expire IS NULL AND id_document_expiry IS NOT NULL;

-- Migrate existing country to country_of_birth
UPDATE customers
SET country_of_birth = country
WHERE country_of_birth IS NULL AND country IS NOT NULL;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_customers_member_id ON customers (member_id);
CREATE INDEX IF NOT EXISTS idx_customers_identity_number ON customers (identity_number);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers (status);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone_number);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (last_name, first_name);
