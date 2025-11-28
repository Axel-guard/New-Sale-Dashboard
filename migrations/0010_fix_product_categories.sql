-- Fix product categories with correct names
-- Create table if not exists (defensive)
CREATE TABLE IF NOT EXISTS product_categories (
  id INTEGER PRIMARY KEY,
  category_name TEXT NOT NULL UNIQUE
);

-- Remove old incorrect categories
DELETE FROM product_categories;

-- Insert correct product categories
INSERT INTO product_categories (id, category_name) VALUES
(1, 'MDVR'),
(2, 'Monitors & Monitor Kit'),
(3, 'Cameras'),
(4, 'Dashcam'),
(5, 'GPS'),
(6, 'Storage'),
(7, 'RFID Tags'),
(8, 'RFID Reader'),
(9, 'MDVR Accessories'),
(10, 'Other Products');
