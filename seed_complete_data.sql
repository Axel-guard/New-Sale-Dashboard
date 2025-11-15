-- ============================================
-- COMPLETE DATABASE SEED SCRIPT - FIXED VERSION
-- This restores all essential data for AxelGuard
-- ============================================

-- ============================================
-- 1. USERS DATA (Already exists, but ensuring)
-- ============================================
INSERT OR IGNORE INTO users (username, password, full_name, role, employee_name, is_active) 
VALUES 
  ('admin', 'YWRtaW4xMjM=', 'Administrator', 'admin', NULL, 1),
  ('akash', 'ZW1wbG95ZWUxMjM=', 'Akash Parashar', 'employee', 'Akash Parashar', 1),
  ('mandeep', 'ZW1wbG95ZWUxMjM=', 'Mandeep Samal', 'employee', 'Mandeep Samal', 1),
  ('smruti', 'ZW1wbG95ZWUxMjM=', 'Smruti Ranjan Nayak', 'employee', 'Smruti Ranjan Nayak', 1);

-- ============================================
-- 2. PRODUCT CATEGORIES
-- ============================================
INSERT OR IGNORE INTO product_categories (id, category_name) VALUES
  (1, 'MDVR'),
  (2, 'Monitor & Monitor Kit'),
  (3, 'Camera'),
  (4, 'Panic Button'),
  (5, 'Fuel Sensor'),
  (6, 'GPS Tracker'),
  (7, 'DVR & NVR'),
  (8, 'Hard Disk'),
  (9, 'ADAS & DSM'),
  (10, 'Accessories');

-- ============================================
-- 3. PRODUCTS (Sample Products)
-- ============================================
INSERT OR IGNORE INTO products (product_name, category_id, unit_price) VALUES
  -- MDVR Products
  ('4ch 1080p SD Card MDVR (MR9504EC)', 1, 8500),
  ('4ch 1080p HDD MDVR (MR9704C)', 1, 12000),
  ('4ch 1080p SD, 4G, GPS MDVR (MR9504E)', 1, 9500),
  ('4ch 1080p HDD, 4G, GPS MDVR (MR9704E)', 1, 13500),
  ('AI MDVR with (DSM + ADAS) (SD+ 4g + GPS)', 1, 18000),
  ('AI MDVR with (DSM + ADAS) (SD+HDD+ 4g + GPS)', 1, 22000),
  
  -- Monitors
  ('7" AV Monitor', 2, 2500),
  ('7" VGA Monitor', 2, 2800),
  ('7" HDMI Monitor', 2, 3000),
  ('9" Monitor', 2, 4500),
  ('10.1" Monitor', 2, 6500),
  
  -- Cameras
  ('Analog AHD Camera 2MP', 3, 800),
  ('Analog AHD Camera 5MP', 3, 1200),
  ('IP Camera 2MP', 3, 2500),
  ('IP Camera 5MP', 3, 3500),
  
  -- GPS Trackers
  ('GPS Tracker Basic', 6, 2500),
  ('GPS Tracker Advanced with 4G', 6, 3500),
  
  -- Hard Disks
  ('500GB HDD', 8, 2500),
  ('1TB HDD', 8, 3500),
  ('2TB HDD', 8, 5500),
  
  -- Accessories
  ('Extension Cable 5m', 10, 150),
  ('Extension Cable 10m', 10, 250),
  ('Power Cable', 10, 100),
  ('4G Antenna', 10, 300),
  ('Microphone', 10, 250);

-- ============================================
-- 4. SAMPLE CUSTOMERS
-- ============================================
INSERT OR IGNORE INTO customers (customer_code, customer_name, contact_person, mobile, email, address, city, state, gst_number) VALUES
  ('CUST001', 'ABC Transport Services', 'Rajesh Kumar', '9876543210', 'rajesh@abctransport.com', '123 Transport Nagar', 'Delhi', 'Delhi', '07AABCU9603R1ZV'),
  ('CUST002', 'XYZ Logistics Pvt Ltd', 'Priya Sharma', '9876543211', 'priya@xyzlogistics.com', '456 Logistics Hub', 'Mumbai', 'Maharashtra', '27AABCU9603R1ZW'),
  ('CUST003', 'Speedy Couriers', 'Amit Patel', '9876543212', 'amit@speedycouriers.com', '789 Courier Lane', 'Ahmedabad', 'Gujarat', '24AABCU9603R1ZX'),
  ('CUST004', 'Metro Bus Services', 'Sunita Reddy', '9876543213', 'sunita@metrobus.com', '321 Bus Stand Road', 'Hyderabad', 'Telangana', '36AABCU9603R1ZY'),
  ('CUST005', 'Royal Travels', 'Vikram Singh', '9876543214', 'vikram@royaltravels.com', '654 Travel Plaza', 'Jaipur', 'Rajasthan', '08AABCU9603R1ZZ');

-- ============================================
-- 5. SAMPLE LEADS
-- ============================================
INSERT OR IGNORE INTO leads (customer_code, customer_name, contact_person, mobile, email, address, city, state, product_interest, lead_source, status, employee_name, notes) VALUES
  ('LEAD001', 'Fast Track Logistics', 'Anil Verma', '9876543220', 'anil@fasttrack.com', '111 Logistics Park', 'Pune', 'Maharashtra', '4ch MDVR with GPS', 'Website', 'New', 'Akash Parashar', 'Interested in 10 units'),
  ('LEAD002', 'Green Transport Co', 'Meena Joshi', '9876543221', 'meena@greentransport.com', '222 Green Avenue', 'Bangalore', 'Karnataka', 'GPS Tracker', 'Referral', 'Contacted', 'Mandeep Samal', 'Budget conscious'),
  ('LEAD003', 'City Cabs', 'Ravi Kumar', '9876543222', 'ravi@citycabs.com', '333 Cab Stand', 'Chennai', 'Tamil Nadu', 'AI MDVR with ADAS', 'Cold Call', 'Qualified', 'Smruti Ranjan Nayak', 'Fleet of 50 vehicles'),
  ('LEAD004', 'Express Delivery', 'Pooja Mehta', '9876543223', 'pooja@express.com', '444 Delivery Hub', 'Kolkata', 'West Bengal', 'Basic MDVR', 'Exhibition', 'New', 'Akash Parashar', 'Met at trade show');

-- ============================================
-- 6. SAMPLE SALES DATA
-- ============================================
INSERT OR IGNORE INTO sales (order_id, customer_code, customer_name, contact_person, mobile, email, address, city, state, gst_number, order_date, total_amount, payment_mode, payment_status, balance_amount, courier_partner, courier_cost, employee_name) VALUES
  ('ORD-2025-001', 'CUST001', 'ABC Transport Services', 'Rajesh Kumar', '9876543210', 'rajesh@abctransport.com', '123 Transport Nagar', 'Delhi', 'Delhi', '07AABCU9603R1ZV', '2025-01-10', 95000, 'Bank Transfer', 'Paid', 0, 'DTDC', 500, 'Akash Parashar'),
  ('ORD-2025-002', 'CUST002', 'XYZ Logistics Pvt Ltd', 'Priya Sharma', '9876543211', 'priya@xyzlogistics.com', '456 Logistics Hub', 'Mumbai', 'Maharashtra', '27AABCU9603R1ZW', '2025-01-12', 135000, 'Cheque', 'Partial', 35000, 'Trackon', 600, 'Mandeep Samal'),
  ('ORD-2025-003', 'CUST003', 'Speedy Couriers', 'Amit Patel', '9876543212', 'amit@speedycouriers.com', '789 Courier Lane', 'Ahmedabad', 'Gujarat', '24AABCU9603R1ZX', '2025-01-15', 180000, 'Bank Transfer', 'Paid', 0, 'Porter', 450, 'Smruti Ranjan Nayak'),
  ('ORD-2025-004', 'CUST004', 'Metro Bus Services', 'Sunita Reddy', '9876543213', 'sunita@metrobus.com', '321 Bus Stand Road', 'Hyderabad', 'Telangana', '36AABCU9603R1ZY', '2025-01-18', 220000, 'Cash', 'Partial', 70000, 'DTDC', 550, 'Akash Parashar'),
  ('ORD-2025-005', 'CUST005', 'Royal Travels', 'Vikram Singh', '9876543214', 'vikram@royaltravels.com', '654 Travel Plaza', 'Jaipur', 'Rajasthan', '08AABCU9603R1ZZ', '2025-01-20', 54000, 'Bank Transfer', 'Paid', 0, 'Self Pick', 0, 'Mandeep Samal');

-- ============================================
-- 7. COURIER RATES
-- ============================================
INSERT OR IGNORE INTO courier_rates (partner, method, rate_per_kg) VALUES
  ('Trackon', 'Air', 45),
  ('Trackon', 'Surface', 25),
  ('DTDC', 'Air', 50),
  ('DTDC', 'Surface', 28),
  ('Porter', 'Express', 60),
  ('Porter', 'Standard', 35),
  ('Self Pick', 'Self', 0),
  ('By Bus', 'Surface', 20);

-- ============================================
-- 8. SAMPLE INVENTORY DATA
-- ============================================
INSERT OR IGNORE INTO inventory (serial_number, product_name, status, order_id) VALUES
  -- MDVR Units
  ('MDVR-001-2025', '4ch 1080p SD Card MDVR (MR9504EC)', 'in_stock', NULL),
  ('MDVR-002-2025', '4ch 1080p SD Card MDVR (MR9504EC)', 'in_stock', NULL),
  ('MDVR-003-2025', '4ch 1080p SD Card MDVR (MR9504EC)', 'dispatched', 'ORD-2025-001'),
  ('MDVR-004-2025', '4ch 1080p HDD MDVR (MR9704C)', 'in_stock', NULL),
  ('MDVR-005-2025', '4ch 1080p HDD MDVR (MR9704C)', 'qc_pending', NULL),
  ('MDVR-006-2025', '4ch 1080p SD, 4G, GPS MDVR (MR9504E)', 'in_stock', NULL),
  ('MDVR-007-2025', '4ch 1080p SD, 4G, GPS MDVR (MR9504E)', 'in_stock', NULL),
  ('MDVR-008-2025', '4ch 1080p SD, 4G, GPS MDVR (MR9504E)', 'dispatched', 'ORD-2025-002'),
  
  -- Cameras
  ('CAM-001-2025', 'Analog AHD Camera 2MP', 'in_stock', NULL),
  ('CAM-002-2025', 'Analog AHD Camera 2MP', 'in_stock', NULL),
  ('CAM-003-2025', 'Analog AHD Camera 5MP', 'in_stock', NULL),
  ('CAM-004-2025', 'Analog AHD Camera 5MP', 'qc_pending', NULL),
  
  -- GPS Trackers
  ('GPS-001-2025', 'GPS Tracker Basic', 'in_stock', NULL),
  ('GPS-002-2025', 'GPS Tracker Basic', 'in_stock', NULL),
  ('GPS-003-2025', 'GPS Tracker Advanced with 4G', 'in_stock', NULL);

-- ============================================
-- 9. SAMPLE DISPATCH RECORDS
-- ============================================
INSERT OR IGNORE INTO dispatch_records (order_id, serial_number, product_name, dispatch_date, dispatch_person) VALUES
  ('ORD-2025-001', 'MDVR-003-2025', '4ch 1080p SD Card MDVR (MR9504EC)', '2025-01-11', 'Akash Parashar'),
  ('ORD-2025-002', 'MDVR-008-2025', '4ch 1080p SD, 4G, GPS MDVR (MR9504E)', '2025-01-13', 'Mandeep Samal');

-- ============================================
-- 10. SAMPLE QUALITY CHECK DATA
-- ============================================
INSERT OR IGNORE INTO quality_check (serial_number, product_name, qc_status, qc_date, qc_person, remarks) VALUES
  ('MDVR-005-2025', '4ch 1080p HDD MDVR (MR9704C)', 'Pending', '2025-01-22', 'Smruti Ranjan Nayak', 'Awaiting final inspection'),
  ('CAM-004-2025', 'Analog AHD Camera 5MP', 'Pending', '2025-01-22', 'Akash Parashar', 'Camera lens needs verification');

-- ============================================
-- DATA RESTORATION COMPLETE
-- ============================================
