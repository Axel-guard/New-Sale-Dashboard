-- Add customer_code to leads table  
ALTER TABLE leads ADD COLUMN customer_code TEXT;

-- Add order_id column to sale_items for easier querying
ALTER TABLE sale_items ADD COLUMN order_id TEXT;
