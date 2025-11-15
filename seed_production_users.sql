-- Seed production database with initial users
-- Password: admin123 (base64 encoded: YWRtaW4xMjM=)

-- Clear existing users (optional - comment out if you want to keep existing data)
DELETE FROM users;

-- Insert 4 default users (role must be 'admin' or 'employee')
INSERT INTO users (username, password, full_name, role, is_active, employee_name) VALUES
('admin', 'YWRtaW4xMjM=', 'Administrator', 'admin', 1, 'Admin User'),
('mandeep', 'YWRtaW4xMjM=', 'Mandeep Samal', 'employee', 1, 'Mandeep Samal'),
('priyanshu', 'YWRtaW4xMjM=', 'Priyanshu Mishra', 'employee', 1, 'Priyanshu Mishra'),
('vikash', 'YWRtaW4xMjM=', 'Vikash Yadav', 'employee', 1, 'Vikash Yadav');

-- Verify users were created
SELECT 'Users created successfully!' as message;
SELECT id, username, full_name, role, is_active FROM users;
