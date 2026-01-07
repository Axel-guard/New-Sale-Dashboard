-- Make order_id nullable in tracking_details table
-- This allows tracking replacements without linked sales orders

-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table
-- Step 1: Create new table with nullable order_id
CREATE TABLE tracking_details_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT, -- Changed from NOT NULL to nullable
  courier_partner TEXT NOT NULL,
  courier_mode TEXT NOT NULL,
  tracking_id TEXT NOT NULL,
  weight REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  type TEXT DEFAULT 'Sale'
);

-- Step 2: Copy data from old table
INSERT INTO tracking_details_new (id, order_id, courier_partner, courier_mode, tracking_id, weight, created_at, updated_at, type)
SELECT id, order_id, courier_partner, courier_mode, tracking_id, weight, created_at, updated_at, type
FROM tracking_details;

-- Step 3: Drop old table
DROP TABLE tracking_details;

-- Step 4: Rename new table to original name
ALTER TABLE tracking_details_new RENAME TO tracking_details;

-- Step 5: Recreate index
CREATE INDEX IF NOT EXISTS idx_tracking_order_id ON tracking_details(order_id);
