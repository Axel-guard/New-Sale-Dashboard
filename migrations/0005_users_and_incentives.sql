-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'employee')),
  employee_name TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Incentives table
CREATE TABLE IF NOT EXISTS incentives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_name TEXT NOT NULL,
  month TEXT NOT NULL,
  year INTEGER NOT NULL,
  total_sales_without_tax REAL NOT NULL,
  target_amount REAL DEFAULT 550000,
  incentive_earned REAL DEFAULT 0,
  incentive_percentage REAL DEFAULT 1.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_incentives_employee ON incentives(employee_name);
CREATE INDEX IF NOT EXISTS idx_incentives_month_year ON incentives(month, year);

-- Insert default admin user (password: admin123)
-- Password is hashed using simple base64 for demo (in production, use bcrypt)
INSERT OR IGNORE INTO users (username, password, full_name, role, employee_name) 
VALUES ('admin', 'YWRtaW4xMjM=', 'Administrator', 'admin', NULL);

-- Insert employee users with default passwords (employee123)
INSERT OR IGNORE INTO users (username, password, full_name, role, employee_name) 
VALUES 
  ('akash', 'ZW1wbG95ZWUxMjM=', 'Akash Parashar', 'employee', 'Akash Parashar'),
  ('mandeep', 'ZW1wbG95ZWUxMjM=', 'Mandeep Samal', 'employee', 'Mandeep Samal'),
  ('smruti', 'ZW1wbG95ZWUxMjM=', 'Smruti Ranjan Nayak', 'employee', 'Smruti Ranjan Nayak');
