-- Sync customers table with real data from sales table
-- This script populates the customers table with actual customer data from sales records

-- Step 1: Clear any test/sample data
DELETE FROM customers WHERE name = 'Test Customer' OR name LIKE '%Test%';

-- Step 2: Insert real customers from sales table
-- Uses INSERT OR REPLACE to update existing and add new customers
INSERT OR REPLACE INTO customers (customer_code, name, phone, company_name, address)
SELECT DISTINCT 
  customer_code,
  customer_name as name,
  customer_contact as phone,
  company_name,
  COALESCE(address, 'Not specified') as address
FROM sales
WHERE customer_code IS NOT NULL 
  AND customer_code != ''
  AND customer_name IS NOT NULL
GROUP BY customer_code;

-- Step 3: Verify the sync
-- This should show the count of synced customers
SELECT COUNT(DISTINCT customer_code) as total_customers FROM customers WHERE customer_code IS NOT NULL;
