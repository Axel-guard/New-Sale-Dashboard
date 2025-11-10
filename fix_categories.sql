-- Update existing categories to correct names
UPDATE product_categories SET category_name = 'MDVR' WHERE id = 1;
UPDATE product_categories SET category_name = 'Cameras' WHERE id = 2;
UPDATE product_categories SET category_name = 'MDVR Accessories' WHERE id = 3;

-- Insert missing categories
INSERT OR IGNORE INTO product_categories (id, category_name) VALUES
(4, 'Monitors & Monitor Kit'),
(5, 'Dashcam'),
(6, 'GPS'),
(7, 'Storage'),
(8, 'RFID Tags'),
(9, 'RFID Reader'),
(10, 'Other Products');
