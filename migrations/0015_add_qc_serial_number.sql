-- Add serial_number column to quality_check for display/counting
ALTER TABLE quality_check ADD COLUMN serial_number INTEGER;

-- Update existing records with serial numbers
UPDATE quality_check SET serial_number = id WHERE serial_number IS NULL;

-- Create index
CREATE INDEX IF NOT EXISTS idx_quality_check_serial_number ON quality_check(serial_number);
