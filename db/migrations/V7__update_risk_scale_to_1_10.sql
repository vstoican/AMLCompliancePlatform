-- Update risk scale from 0-10 to 1-10, and score scale to 1-100
-- This migration updates default values and existing data

-- Update existing customers with 0 values to 1 (new minimum)
UPDATE customers
SET geography_risk = 1
WHERE geography_risk = 0 OR geography_risk < 1;

UPDATE customers
SET product_risk = 1
WHERE product_risk = 0 OR product_risk < 1;

UPDATE customers
SET behavior_risk = 1
WHERE behavior_risk = 0 OR behavior_risk < 1;

-- Alter column defaults to 1 instead of 0
ALTER TABLE customers
ALTER COLUMN geography_risk SET DEFAULT 1,
ALTER COLUMN product_risk SET DEFAULT 1,
ALTER COLUMN behavior_risk SET DEFAULT 1;

-- Add constraints to ensure values are between 1 and 10
ALTER TABLE customers
ADD CONSTRAINT geography_risk_range CHECK (geography_risk >= 1 AND geography_risk <= 10),
ADD CONSTRAINT product_risk_range CHECK (product_risk >= 1 AND product_risk <= 10),
ADD CONSTRAINT behavior_risk_range CHECK (behavior_risk >= 1 AND behavior_risk <= 10);
