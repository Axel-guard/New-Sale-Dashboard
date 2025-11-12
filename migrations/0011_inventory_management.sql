-- Inventory Management Schema
-- Stores device inventory with dispatch, quality check, and warranty tracking

CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  in_date DATE,
  model_name TEXT NOT NULL,
  device_serial_no TEXT UNIQUE NOT NULL,
  dispatch_date DATE,
  cust_code TEXT,
  sale_date DATE,
  customer_name TEXT,
  cust_city TEXT,
  cust_mobile TEXT,
  dispatch_reason TEXT,
  warranty_provide TEXT,
  old_serial_no TEXT,
  license_renew_time DATE,
  user_id TEXT,
  password TEXT,
  account_activation_date DATE,
  account_expiry_date DATE,
  order_id TEXT,
  status TEXT DEFAULT 'In Stock' CHECK(status IN ('In Stock', 'Dispatched', 'Quality Check', 'Defective', 'Returned')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Inventory Status History (tracks status changes)
CREATE TABLE IF NOT EXISTS inventory_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER NOT NULL,
  device_serial_no TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  changed_by TEXT,
  change_reason TEXT,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
);

-- Quality Check Records
CREATE TABLE IF NOT EXISTS quality_check (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER NOT NULL,
  device_serial_no TEXT NOT NULL,
  check_date DATE NOT NULL,
  checked_by TEXT NOT NULL,
  test_results TEXT,
  pass_fail TEXT CHECK(pass_fail IN ('Pass', 'Fail')),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
);

-- Dispatch Records
CREATE TABLE IF NOT EXISTS dispatch_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER NOT NULL,
  device_serial_no TEXT NOT NULL,
  dispatch_date DATE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_code TEXT,
  customer_mobile TEXT,
  customer_city TEXT,
  dispatch_reason TEXT,
  courier_name TEXT,
  tracking_number TEXT,
  dispatched_by TEXT NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_inventory_serial ON inventory(device_serial_no);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);
CREATE INDEX IF NOT EXISTS idx_inventory_cust_code ON inventory(cust_code);
CREATE INDEX IF NOT EXISTS idx_inventory_order_id ON inventory(order_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_serial ON dispatch_records(device_serial_no);
CREATE INDEX IF NOT EXISTS idx_quality_serial ON quality_check(device_serial_no);
