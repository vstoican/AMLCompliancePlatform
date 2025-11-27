-- Add system flag to distinguish default alerts from user-created ones

ALTER TABLE alert_definitions
ADD COLUMN IF NOT EXISTS is_system_default BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark existing alerts as system defaults
UPDATE alert_definitions
SET is_system_default = TRUE
WHERE code IN ('CASH_OVER_10K_EUR', 'EXTERNAL_TRANSFER_OVER_10K_EUR', 'REMITTANCE_OVER_2K_EUR');
