-- Migration: Remove FOREIGN KEY constraint from tracking_details table
-- Reason: Allow tracking details for orders not yet in sales table
-- Date: 2025-11-18

-- SQLite doesn't support ALTER TABLE to drop constraints
-- We need to recreate the table without the FOREIGN KEY

-- Step 1: Create new table without FOREIGN KEY constraint
CREATE TABLE tracking_details_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  courier_partner TEXT NOT NULL,
  courier_mode TEXT NOT NULL,
  tracking_id TEXT NOT NULL,
  weight REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Copy existing data (if any)
INSERT INTO tracking_details_new (id, order_id, courier_partner, courier_mode, tracking_id, weight, created_at, updated_at)
SELECT id, order_id, courier_partner, courier_mode, tracking_id, weight, created_at, updated_at
FROM tracking_details;

-- Step 3: Drop old table
DROP TABLE tracking_details;

-- Step 4: Rename new table to original name
ALTER TABLE tracking_details_new RENAME TO tracking_details;

-- Step 5: Create index for better performance
CREATE INDEX IF NOT EXISTS idx_tracking_order_id ON tracking_details(order_id);
CREATE INDEX IF NOT EXISTS idx_tracking_created_at ON tracking_details(created_at);
