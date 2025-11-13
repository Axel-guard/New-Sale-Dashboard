-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT UNIQUE NOT NULL,
  customer_code TEXT,
  customer_name TEXT NOT NULL,
  company_name TEXT,
  customer_mobile TEXT,
  customer_city TEXT,
  order_date DATE NOT NULL,
  total_items INTEGER DEFAULT 0,
  dispatch_status TEXT DEFAULT 'Pending', -- Pending, Partial, Completed
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Order items (products in each order)
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_category TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  scanned_count INTEGER DEFAULT 0,
  inventory_ids TEXT, -- JSON array of inventory IDs that were scanned
  serial_numbers TEXT, -- JSON array of serial numbers
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

-- Add order_id and qc_status columns to dispatch_records if not exists
ALTER TABLE dispatch_records ADD COLUMN order_id TEXT;
ALTER TABLE dispatch_records ADD COLUMN qc_status TEXT DEFAULT 'Pending';
ALTER TABLE dispatch_records ADD COLUMN dispatch_method TEXT;
ALTER TABLE dispatch_records ADD COLUMN company_name TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_code);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_records_order_id ON dispatch_records(order_id);
