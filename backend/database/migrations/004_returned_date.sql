-- Migration 004: Add package_reference and returned_date to cod_records
-- package_reference stores the UPS Package Reference # (shipper's reference / company name)
-- used to match Activity Summary "Returned Checks" entries back to their cod_record rows.
-- returned_date stores the date UPS returned the check.

ALTER TABLE cod_records ADD COLUMN IF NOT EXISTS package_reference VARCHAR(255);
ALTER TABLE cod_records ADD COLUMN IF NOT EXISTS returned_date DATE;
