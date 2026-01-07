-- Add type column to tracking_details table
-- Allows tracking Sale vs Replacement shipments
ALTER TABLE tracking_details ADD COLUMN type TEXT DEFAULT 'Sale';

-- Make order_id nullable for replacement tracking without linked orders
-- Note: SQLite doesn't support ALTER COLUMN directly, but we can work with the existing schema
-- The application will handle NULL order_ids in the backend validation
