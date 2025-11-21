-- Migration: Allow NULL inventory_id for auto-completed devices
-- SQLite doesn't support ALTER COLUMN directly, so we need to recreate the table

-- Step 1: Create new table with nullable inventory_id
CREATE TABLE IF NOT EXISTS dispatch_records_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER, -- Changed from NOT NULL to nullable
  device_serial_no TEXT NOT NULL,
  order_id TEXT,
  dispatch_date DATE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_code TEXT,
  customer_mobile TEXT,
  customer_city TEXT,
  company_name TEXT,
  dispatch_reason TEXT,
  qc_status TEXT,
  courier_name TEXT,
  tracking_number TEXT,
  dispatch_method TEXT,
  dispatched_by TEXT NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE SET NULL
);

-- Step 2: Copy all existing data
INSERT INTO dispatch_records_new 
SELECT * FROM dispatch_records;

-- Step 3: Drop old table
DROP TABLE dispatch_records;

-- Step 4: Rename new table
ALTER TABLE dispatch_records_new RENAME TO dispatch_records;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_dispatch_inventory ON dispatch_records(inventory_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_serial ON dispatch_records(device_serial_no);
CREATE INDEX IF NOT EXISTS idx_dispatch_order ON dispatch_records(order_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_date ON dispatch_records(dispatch_date);
