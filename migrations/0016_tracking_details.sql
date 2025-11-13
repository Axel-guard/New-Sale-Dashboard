-- Tracking Details Table
-- Stores courier tracking information for dispatched orders
CREATE TABLE IF NOT EXISTS tracking_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  courier_partner TEXT NOT NULL,
  courier_mode TEXT NOT NULL, -- Air, Surface, Express, etc.
  tracking_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES sales(order_id)
);

-- Create index for faster lookup by order_id
CREATE INDEX IF NOT EXISTS idx_tracking_order_id ON tracking_details(order_id);
