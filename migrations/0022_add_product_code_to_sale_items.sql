-- Add product_code column to sale_items table
-- This allows proper JOINing with products table to get product names

-- Add product_code column if it doesn't exist
ALTER TABLE sale_items ADD COLUMN product_code TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sale_items_product_code ON sale_items(product_code);
