-- Add weight column to tracking_details table
-- Stores the weight of the product in kilograms
ALTER TABLE tracking_details ADD COLUMN weight REAL DEFAULT 0;
