-- Add serial_number column to inventory (for display/counting)
ALTER TABLE inventory ADD COLUMN serial_number INTEGER;

-- Add serial_number column to dispatch_records (for display/counting)
ALTER TABLE dispatch_records ADD COLUMN serial_number INTEGER;

-- Update existing inventory records with serial numbers
UPDATE inventory SET serial_number = id WHERE serial_number IS NULL;

-- Update existing dispatch_records with serial numbers
UPDATE dispatch_records SET serial_number = id WHERE serial_number IS NULL;
