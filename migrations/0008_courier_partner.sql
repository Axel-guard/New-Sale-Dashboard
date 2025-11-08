-- Add courier partner and delivery method columns
ALTER TABLE quotations ADD COLUMN courier_partner TEXT;
ALTER TABLE quotations ADD COLUMN delivery_method TEXT;

-- Create courier_rates table for automatic charge calculation
CREATE TABLE IF NOT EXISTS courier_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  courier_partner TEXT NOT NULL,
  delivery_method TEXT NOT NULL,
  base_rate REAL DEFAULT 0,
  per_kg_rate REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default courier rates
INSERT INTO courier_rates (courier_partner, delivery_method, base_rate, per_kg_rate) VALUES
('DTDC', 'Surface', 100, 15),
('DTDC', 'Express', 150, 25),
('Blue Dart', 'Surface', 120, 18),
('Blue Dart', 'Express', 180, 30),
('Delhivery', 'Surface', 90, 12),
('Delhivery', 'Express', 140, 22),
('Professional Courier', 'Surface', 110, 16),
('Professional Courier', 'Express', 160, 28),
('Self Pickup', 'Self Pickup', 0, 0),
('Hand Delivery', 'Hand Delivery', 200, 0);

CREATE INDEX IF NOT EXISTS idx_courier_rates_partner ON courier_rates(courier_partner, delivery_method);
