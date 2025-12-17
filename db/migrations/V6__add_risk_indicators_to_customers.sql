-- Add risk indicator columns to customers table for editing capability

ALTER TABLE customers
ADD COLUMN IF NOT EXISTS geography_risk NUMERIC(4,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS product_risk NUMERIC(4,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS behavior_risk NUMERIC(4,2) DEFAULT 0;

-- Update existing customers with default values
UPDATE customers
SET geography_risk = 0,
    product_risk = 0,
    behavior_risk = 0
WHERE geography_risk IS NULL;
