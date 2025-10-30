-- Add customer name and company name to sales table
ALTER TABLE sales ADD COLUMN customer_name TEXT;
ALTER TABLE sales ADD COLUMN company_name TEXT;

-- Add account received to payment history
ALTER TABLE payment_history ADD COLUMN account_received TEXT;
