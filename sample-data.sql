-- Sample data for testing AxelGuard Dashboard
-- Run this AFTER running schema.sql

-- Sample leads
INSERT OR IGNORE INTO leads (customer_code, customer_name, mobile_number, alternate_mobile, location, company_name, gst_number, email, status)
VALUES 
    ('001', 'Rajesh Kumar', '9876543210', '9876543211', 'Delhi', 'ABC Transport Pvt Ltd', '29ABCDE1234F1Z5', 'rajesh@abc.com', 'Active'),
    ('002', 'Priya Sharma', '9876543220', NULL, 'Mumbai', 'XYZ Logistics', '27XYZAB5678G1H9', 'priya@xyz.com', 'New'),
    ('003', 'Amit Patel', '9876543230', '9876543231', 'Ahmedabad', 'DEF Transport Co', '24DEFGH9012I1J3', 'amit@def.com', 'Active');

-- Sample sales
INSERT OR IGNORE INTO sales (
    order_id, customer_code, customer_name, company_name, customer_contact,
    sale_date, employee_name, sale_type, courier_cost,
    amount_received, account_received, subtotal, gst_amount, total_amount, balance_amount
)
VALUES 
    ('ORD001', '001', 'Rajesh Kumar', 'ABC Transport Pvt Ltd', '9876543210',
     '2025-10-25 10:30:00', 'Akash Parashar', 'With', 500,
     50000, 'IDFC(4828)', 100000, 18000, 118500, 68500),
    
    ('ORD002', '002', 'Priya Sharma', 'XYZ Logistics', '9876543220',
     '2025-10-26 14:15:00', 'Mandeep Samal', 'With', 300,
     75000, 'IDFC(7455)', 150000, 27000, 177300, 102300),
    
    ('ORD003', '003', 'Amit Patel', 'DEF Transport Co', '9876543230',
     '2025-10-28 09:45:00', 'Smruti Ranjan Nayak', 'Without', 0,
     50000, 'Cash', 50000, 0, 50000, 0);

-- Sample sale items
INSERT OR IGNORE INTO sale_items (order_id, product_name, quantity, unit_price)
VALUES 
    ('ORD001', '4k MDVR kit 4ch', 2, 30000),
    ('ORD001', '2 MP IR indoor Dome Camera', 5, 4000),
    ('ORD001', 'Surveillance Grade 128GB SD Card', 4, 2500),
    
    ('ORD002', '4k MDVR kit 8ch', 3, 50000),
    
    ('ORD003', '4 Inch 2 Ch Dashcam', 10, 5000);

-- Sample payment history
INSERT OR IGNORE INTO payment_history (order_id, payment_date, amount, account_received, payment_reference)
VALUES 
    ('ORD001', '2025-10-25 10:30:00', 50000, 'IDFC(4828)', 'REF001'),
    ('ORD002', '2025-10-26 14:15:00', 75000, 'IDFC(7455)', 'REF002'),
    ('ORD003', '2025-10-28 09:45:00', 50000, 'Cash', NULL);
