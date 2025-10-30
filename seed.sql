-- Insert sample employees and sales data
INSERT OR IGNORE INTO sales (employee_name, customer_name, customer_phone, customer_email, product_name, quantity, unit_price, total_amount, payment_type, paid_amount, balance_amount, order_id, courier_details, sale_date) VALUES 
  ('John Smith', 'Alice Johnson', '9876543210', 'alice@example.com', 'AxelGuard Pro', 2, 15000, 30000, 'payment_done', 30000, 0, 'ORD001', 'DHL - Track#12345', datetime('now', '-5 days')),
  ('Sarah Williams', 'Bob Miller', '9876543211', 'bob@example.com', 'AxelGuard Basic', 1, 10000, 10000, 'partial_payment', 5000, 5000, 'ORD002', 'FedEx - Track#67890', datetime('now', '-3 days')),
  ('John Smith', 'Charlie Brown', '9876543212', 'charlie@example.com', 'AxelGuard Premium', 3, 20000, 60000, 'credit', 0, 60000, 'ORD003', 'BlueDart - Track#11111', datetime('now', '-2 days')),
  ('Michael Davis', 'Diana Prince', '9876543213', 'diana@example.com', 'AxelGuard Pro', 1, 15000, 15000, 'payment_done', 15000, 0, 'ORD004', 'DHL - Track#22222', datetime('now', '-1 day')),
  ('Sarah Williams', 'Eve Adams', '9876543214', 'eve@example.com', 'AxelGuard Basic', 2, 10000, 20000, 'partial_payment', 10000, 10000, 'ORD005', 'FedEx - Track#33333', datetime('now')),
  ('John Smith', 'Frank Castle', '9876543215', 'frank@example.com', 'AxelGuard Premium', 1, 20000, 20000, 'payment_done', 20000, 0, 'ORD006', 'BlueDart - Track#44444', datetime('now')),
  ('Michael Davis', 'Grace Lee', '9876543216', 'grace@example.com', 'AxelGuard Pro', 2, 15000, 30000, 'credit', 0, 30000, 'ORD007', 'DHL - Track#55555', datetime('now')),
  ('Sarah Williams', 'Henry Wilson', '9876543217', 'henry@example.com', 'AxelGuard Basic', 1, 10000, 10000, 'payment_done', 10000, 0, 'ORD008', NULL, datetime('now'));

-- Insert sample customers
INSERT OR IGNORE INTO customers (name, phone, email, address) VALUES 
  ('Alice Johnson', '9876543210', 'alice@example.com', '123 Main St, New York'),
  ('Bob Miller', '9876543211', 'bob@example.com', '456 Oak Ave, Los Angeles'),
  ('Charlie Brown', '9876543212', 'charlie@example.com', '789 Pine Rd, Chicago'),
  ('Diana Prince', '9876543213', 'diana@example.com', '321 Elm St, Houston'),
  ('Eve Adams', '9876543214', 'eve@example.com', '654 Maple Dr, Phoenix'),
  ('Frank Castle', '9876543215', 'frank@example.com', '987 Cedar Ln, Philadelphia'),
  ('Grace Lee', '9876543216', 'grace@example.com', '147 Birch Ct, San Antonio'),
  ('Henry Wilson', '9876543217', 'henry@example.com', '258 Spruce Way, San Diego');
