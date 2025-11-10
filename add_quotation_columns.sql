-- Add missing columns to quotations table
ALTER TABLE quotations ADD COLUMN created_by TEXT;
ALTER TABLE quotations ADD COLUMN status TEXT DEFAULT 'draft';
