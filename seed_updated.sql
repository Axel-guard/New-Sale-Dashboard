-- Disable foreign keys temporarily
PRAGMA foreign_keys = OFF;

-- Clear existing data
DELETE FROM payment_history;
DELETE FROM sale_items;
DELETE FROM sales;
DELETE FROM leads;

-- Insert sample sales with customer and company names
INSERT INTO sales (id, order_id, customer_code, customer_name, company_name, customer_contact, sale_date, employee_name, sale_type, courier_cost, amount_received, account_received, payment_reference, remarks, subtotal, gst_amount, total_amount, balance_amount) VALUES 
  (1, 'ORD001', 'CUST001', 'Alice Johnson', 'Johnson Enterprises', '9876543210', date('now', '-5 days'), 'Akash Parashar', 'With', 500, 15000, 'IDFC4828', 'REF001', 'First sale', 12711.86, 2288.14, 15500, 500),
  (2, 'ORD002', 'CUST002', 'Bob Miller', 'Miller Trading Co', '9876543211', date('now', '-3 days'), 'Mandeep Samal', 'Without', 300, 8000, 'Cash', 'REF002', 'Cash payment', 8000, 0, 8300, 300),
  (3, 'ORD003', 'CUST003', 'Charlie Brown', 'Brown Industries', '9876543212', date('now', '-2 days'), 'Smruti Ranjan Nayak', 'With', 700, 25000, 'Canara', 'REF003', 'Large order', 21016.95, 3783.05, 25700, 700);

-- Insert sale items
INSERT INTO sale_items (sale_id, product_name, quantity, unit_price, total_price) VALUES
  (1, 'MDVR', 2, 5000, 10000),
  (1, 'Dashcam', 1, 3000, 3000),
  (2, 'Camera', 2, 4000, 8000),
  (3, 'MDVR', 3, 5000, 15000),
  (3, 'Dashcam', 2, 3000, 6000);

-- Insert payment history
INSERT INTO payment_history (sale_id, order_id, payment_date, amount, payment_reference, account_received) VALUES
  (1, 'ORD001', date('now', '-5 days'), 10000, 'REF001-1', 'IDFC4828'),
  (1, 'ORD001', date('now', '-3 days'), 5000, 'REF001-2', 'IDFC7455'),
  (2, 'ORD002', date('now', '-3 days'), 8000, 'REF002-1', 'Cash'),
  (3, 'ORD003', date('now', '-2 days'), 15000, 'REF003-1', 'Canara'),
  (3, 'ORD003', date('now', '-1 day'), 10000, 'REF003-2', 'IDFC4828');

-- Insert sample leads
INSERT INTO leads (customer_name, mobile_number, alternate_mobile, location, company_name, gst_number, email, complete_address, status) VALUES
  ('Rajesh Kumar', '9876543213', '9876543214', 'Delhi', 'Kumar Enterprises', '07AAAAA0000A1Z5', 'rajesh@kumar.com', '123 Main Street, Delhi - 110001', 'New'),
  ('Priya Sharma', '9876543215', NULL, 'Mumbai', 'Sharma Trading Co', '27AAAAA0000A1Z5', 'priya@sharma.com', '456 Market Road, Mumbai - 400001', 'New'),
  ('Amit Patel', '9876543216', '9876543217', 'Ahmedabad', 'Patel Industries', '24AAAAA0000A1Z5', 'amit@patel.com', '789 Industrial Area, Ahmedabad - 380001', 'Contacted');

-- Re-enable foreign keys
PRAGMA foreign_keys = ON;
