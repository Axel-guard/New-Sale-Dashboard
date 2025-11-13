-- Add order_id column to sale_items table for easier querying
-- This allows direct lookup by order_id without joining through sales table

ALTER TABLE sale_items ADD COLUMN order_id TEXT;

-- Create index for faster order_id lookups
CREATE INDEX IF NOT EXISTS idx_sale_items_order_id ON sale_items(order_id);

-- Update existing records to populate order_id from sales table
UPDATE sale_items 
SET order_id = (
  SELECT order_id 
  FROM sales 
  WHERE sales.id = sale_items.sale_id
)
WHERE order_id IS NULL;
