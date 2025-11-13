-- Drop the old quality_check table and recreate with nullable inventory_id
DROP TABLE IF EXISTS quality_check;

CREATE TABLE quality_check (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER,  -- Made nullable so QC records without matching inventory can be stored
  device_serial_no TEXT NOT NULL,
  check_date DATE NOT NULL,
  checked_by TEXT NOT NULL,
  test_results TEXT,
  pass_fail TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_id) REFERENCES inventory(id)
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_quality_check_inventory_id ON quality_check(inventory_id);
CREATE INDEX IF NOT EXISTS idx_quality_check_serial_no ON quality_check(device_serial_no);
