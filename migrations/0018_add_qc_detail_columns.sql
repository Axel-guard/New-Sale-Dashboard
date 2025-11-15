-- Add detailed QC columns to quality_check table
-- These columns will store QC status for each component

ALTER TABLE quality_check ADD COLUMN sd_connect TEXT;
ALTER TABLE quality_check ADD COLUMN all_ch_status TEXT;
ALTER TABLE quality_check ADD COLUMN network TEXT;
ALTER TABLE quality_check ADD COLUMN gps TEXT;
ALTER TABLE quality_check ADD COLUMN sim_slot TEXT;
ALTER TABLE quality_check ADD COLUMN online TEXT;
ALTER TABLE quality_check ADD COLUMN camera_quality TEXT;
ALTER TABLE quality_check ADD COLUMN monitor TEXT;
ALTER TABLE quality_check ADD COLUMN final_status TEXT;
ALTER TABLE quality_check ADD COLUMN ip_address TEXT;

-- Note: Values can be:
-- - "Pass", "Fail", "QC Not Applicable", "QC Not Required"
-- - NULL for old records
