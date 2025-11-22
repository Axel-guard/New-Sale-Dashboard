-- Drop old tables if they exist
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS product_categories;

-- Create new products table matching the catalog structure
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_code TEXT UNIQUE NOT NULL,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  weight REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_products_code ON products(product_code);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(product_name);

-- Insert all products from the hardcoded catalog
-- MDVR Category
INSERT INTO products (product_code, product_name, category, weight) VALUES
  ('AXG01', '4ch 1080p SD Card MDVR (MR9504EC)', 'MDVR', 1),
  ('AXG02', '4ch 1080p HDD MDVR (MR9704C)', 'MDVR', 2),
  ('AXG03', '4ch 1080p SD, 4G, GPS MDVR (MR9504E)', 'MDVR', 1),
  ('AXG73', '4ch 1080p SD, 4G, GPS MDVR (MR9504E-A3)', 'MDVR', 1),
  ('AXG04', '4ch 1080p HDD, 4G, GPS MDVR (MR9704E)', 'MDVR', 2),
  ('TVS43', 'TVS 4ch 1080p SD, 4G, GPS MDVR', 'MDVR', 1),
  ('AXG46', '5ch MDVR SD 4g + GPS + LAN + RS232 + RS485', 'MDVR', 1),
  ('AXG47', '5ch MDVR HDD 4g + GPS + LAN + RS232 + RS485', 'MDVR', 2.2),
  ('AXG58', '4ch 1080p SD, 4G, wifi, GPS MDVR (MA9504ED)', 'MDVR', 1),
  ('AXG38', 'AI MDVR with (DSM + ADAS) (SD+ 4g + GPS)', 'MDVR', 2),
  ('AXG72', 'AI MDVR with (DSM + ADAS) (SD+HDD+ 4g + GPS)', 'MDVR', 3);

-- Monitor & Monitor Kit Category
INSERT INTO products (product_code, product_name, category, weight) VALUES
  ('AXGAA', '7 " AV Monitor', 'Monitor & Monitor Kit', 1),
  ('AXGAB', '7" VGA Monitor', 'Monitor & Monitor Kit', 1),
  ('AXGB1', '7" HDMI Monitor', 'Monitor & Monitor Kit', 1),
  ('AXGAC', '7 inch Heavy Duty VGA Monitor', 'Monitor & Monitor Kit', 1),
  ('AXGAH', '4k Recording monitor kit 2ch', 'Monitor & Monitor Kit', 2),
  ('AXGAD', '4 inch AV monitor', 'Monitor & Monitor Kit', 0.6),
  ('AXGAF', '720 2ch Recording Monitor Kit', 'Monitor & Monitor Kit', 3),
  ('AXGAG', '4k Recording monitor kit 4ch', 'Monitor & Monitor Kit', 2);

-- Dashcam Category
INSERT INTO products (product_code, product_name, category, weight) VALUES
  ('AXGCA', '4 Inch 2 Ch Dashcam', 'Dashcam', 0.4),
  ('AXGCB', '10 inch 2 Ch Full Touch Dashcam', 'Dashcam', 0.75),
  ('AXGCD', '10 inch 2 Ch 4g, GPS, Android Dashcam', 'Dashcam', 0.75),
  ('AXGCE', '4k Dashcam 12 inch', 'Dashcam', 0.75),
  ('AXGCF', '2k 12 inch Dashcam', 'Dashcam', 0.75),
  ('AXGCG', '2ch 4g Dashcam MT95L', 'Dashcam', 1),
  ('AXGCJ', '3ch AI Dashcam ADAS + DSM (MT95C)', 'Dashcam', 1),
  ('AXGCK', 'wifi Dash Cam', 'Dashcam', 0.3),
  ('AXGCL', '4 inch 3 camera Dash Cam', 'Dashcam', 0.4),
  ('AXGCM', '4 inch Android Dashcam', 'Dashcam', 0.5),
  ('AXGCH', '3ch 4g Dashcam with Rear Camera (MT95L-A3)', 'Dashcam', 1);

-- Cameras Category
INSERT INTO products (product_code, product_name, category, weight) VALUES
  ('AXGBA', '2 MP IR indoor Dome Camera', 'Cameras', 0.4),
  ('AXGBB', '2 MP IR Outdoor Bullet Camera', 'Cameras', 0.4),
  ('AXGBC', '2 MP Heavy Duty Bullet Camera', 'Cameras', 0.5),
  ('AXGBD', '2 MP Heavy Duty Dome Camera', 'Cameras', 0.5),
  ('AXGBE', 'PTZ Camera', 'Cameras', 1),
  ('AXGBF', '4k Monitor Camera', 'Cameras', 0.3),
  ('AXGBQ', '2 MP IP Camera', 'Cameras', 0.3),
  ('AXGBG', 'Replacement Bullet Camera 2mp', 'Cameras', 0.3),
  ('AXGBH', 'Replacement Dome Camera 2 mp', 'Cameras', 0.3),
  ('AXGBI', 'Replacement Dome Audio Camera', 'Cameras', 0.3),
  ('AXGBJ', 'Reverse Camera', 'Cameras', 0.3),
  ('AXGBK', '2mp IR Audio Camera', 'Cameras', 0.3),
  ('AXGBL', 'DFMS Camera', 'Cameras', 0.3),
  ('AXGBM', 'ADAS Camera', 'Cameras', 0.3),
  ('AXGBN', 'BSD Camera', 'Cameras', 0.3),
  ('AXGBP', '2mp IP Dome Audio Camera', 'Cameras', 0.3);

-- Storage Category
INSERT INTO products (product_code, product_name, category, weight) VALUES
  ('AXGEA', 'Surveillance Grade 64GB SD Card', 'Storage', 0.05),
  ('AXGEB', 'Surveillance Grade 128GB SD Card', 'Storage', 0.05),
  ('AXGEC', 'Surveillance Grade 256GB SD Card', 'Storage', 0.05),
  ('AXGED', 'Surveillance Grade 512GB SD Card', 'Storage', 0.05),
  ('AXGEE', 'HDD 1 TB', 'Storage', 0.2);

-- RFID Tags Category
INSERT INTO products (product_code, product_name, category, weight) VALUES
  ('AXGFA', '2.4G RFID Animal Ear Tag', 'RFID Tags', 0.01),
  ('AXGFB', '2.4G Active Tag (Card Type) HX607', 'RFID Tags', 0.02);

-- RFID Reader Category
INSERT INTO products (product_code, product_name, category, weight) VALUES
  ('AXGGA', '2.4 GHZ RFID Active Reader (Bus)', 'RFID Reader', 2),
  ('AXGGB', '2.4 GHZ RFID Active Reader (Campus)', 'RFID Reader', 2.5),
  ('AXGGC', '2.4G IOT Smart RFID Reader (ZR7901P)', 'RFID Reader', 2);

-- MDVR Accessories Category
INSERT INTO products (product_code, product_name, category, weight) VALUES
  ('AXGHS', 'MDVR Security Box', 'MDVR Accessories', 0.8),
  ('AXGHB', '2 way Communication Device', 'MDVR Accessories', 0.2),
  ('AXGHC', 'MDVR Maintenance Tool', 'MDVR Accessories', 0.1),
  ('AXGHD', 'MDVR Remote', 'MDVR Accessories', 0.1),
  ('AXGHE', 'MDVR Panic Button', 'MDVR Accessories', 0.1),
  ('AXGHF', 'MDVR Server', 'MDVR Accessories', 2),
  ('AXGHG', 'RS 232 Adaptor', 'MDVR Accessories', 0.1),
  ('AXGHN', '1mt Cable', 'MDVR Accessories', 0.2),
  ('AXGHO', '3mt Cable', 'MDVR Accessories', 0.3),
  ('AXGHH', '5mt Cable', 'MDVR Accessories', 0.3),
  ('AXGHJ', '10mt Cable', 'MDVR Accessories', 0.6),
  ('AXGHI', '15mt Cable', 'MDVR Accessories', 0.8),
  ('AXGHL', 'Alcohol Tester', 'MDVR Accessories', 1),
  ('AXGHK', 'VGA Cable', 'MDVR Accessories', 0.2),
  ('AXGHM', 'Ultra Sonic Fuel Sensor', 'MDVR Accessories', 0.5),
  ('AXGHQ', 'Rod Type Fuel Sensor', 'MDVR Accessories', 0.5);

-- Other product and Accessories Category
INSERT INTO products (product_code, product_name, category, weight) VALUES
  ('AXGIB', 'Leaser Printer', 'Other product and Accessories', 5),
  ('AXGIC', 'D link Wire Bundle', 'Other product and Accessories', 1),
  ('AXGID', 'Wireless Receiver Transmitter', 'Other product and Accessories', 0.5),
  ('AXGIE', 'Parking Sensor', 'Other product and Accessories', 1),
  ('AXGIF', 'MDVR Installation', 'Other product and Accessories', 0),
  ('AXGIG', 'GPS Installation', 'Other product and Accessories', 0),
  ('AXGIH', 'Annual Maintenance Charges', 'Other product and Accessories', 0);
