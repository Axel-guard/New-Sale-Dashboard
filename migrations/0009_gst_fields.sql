-- Add customer_code field to customers table
ALTER TABLE customers ADD COLUMN customer_code TEXT;

-- Add GST fields to customers table
ALTER TABLE customers ADD COLUMN gst_number TEXT;
ALTER TABLE customers ADD COLUMN gst_registered_address TEXT;
ALTER TABLE customers ADD COLUMN company_name TEXT;
ALTER TABLE customers ADD COLUMN concern_person_name TEXT;
ALTER TABLE customers ADD COLUMN concern_person_contact TEXT;

-- Add GST fields to quotations table
ALTER TABLE quotations ADD COLUMN gst_number TEXT;
ALTER TABLE quotations ADD COLUMN gst_registered_address TEXT;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_customer_code ON customers(customer_code);
