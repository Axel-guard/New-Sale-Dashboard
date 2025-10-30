-- AxelGuard Sales Dashboard Database Schema
-- Run this in Cloudflare D1 Console

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'employee')),
    employee_name TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sales table
CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT UNIQUE NOT NULL,
    customer_code TEXT NOT NULL,
    customer_name TEXT,
    company_name TEXT,
    customer_contact TEXT,
    sale_date DATETIME NOT NULL,
    employee_name TEXT NOT NULL,
    sale_type TEXT NOT NULL CHECK(sale_type IN ('With', 'Without')),
    courier_cost REAL DEFAULT 0,
    amount_received REAL DEFAULT 0,
    account_received TEXT,
    payment_reference TEXT,
    remarks TEXT,
    subtotal REAL NOT NULL,
    gst_amount REAL DEFAULT 0,
    total_amount REAL NOT NULL,
    balance_amount REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sale items table
CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES sales(order_id) ON DELETE CASCADE
);

-- Payment history table
CREATE TABLE IF NOT EXISTS payment_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    payment_date DATETIME NOT NULL,
    amount REAL NOT NULL,
    account_received TEXT NOT NULL,
    payment_reference TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES sales(order_id) ON DELETE CASCADE
);

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_code TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    mobile_number TEXT NOT NULL,
    alternate_mobile TEXT,
    location TEXT,
    company_name TEXT,
    gst_number TEXT,
    email TEXT,
    complete_address TEXT,
    status TEXT DEFAULT 'New',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Incentive history table
CREATE TABLE IF NOT EXISTS incentive_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_name TEXT NOT NULL,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    sales_without_tax REAL NOT NULL,
    target_amount REAL NOT NULL,
    achievement_percentage REAL NOT NULL,
    incentive_earned REAL NOT NULL,
    status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Paid')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_name, month, year)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sales_order_id ON sales(order_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_employee ON sales(employee_name);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_code);
CREATE INDEX IF NOT EXISTS idx_sale_items_order ON sale_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_order ON payment_history(order_id);
CREATE INDEX IF NOT EXISTS idx_leads_customer_code ON leads(customer_code);
CREATE INDEX IF NOT EXISTS idx_leads_mobile ON leads(mobile_number);

-- Insert default admin user
-- Password is base64 encoded "admin123"
INSERT OR IGNORE INTO users (username, password, full_name, role, employee_name, is_active)
VALUES ('admin', 'YWRtaW4xMjM=', 'Administrator', 'admin', 'Admin', 1);

-- Insert sample employees
INSERT OR IGNORE INTO users (username, password, full_name, role, employee_name, is_active)
VALUES 
    ('akash', 'YWthc2gxMjM=', 'Akash Parashar', 'employee', 'Akash Parashar', 1),
    ('mandeep', 'bWFuZGVlcDEyMw==', 'Mandeep Samal', 'employee', 'Mandeep Samal', 1),
    ('smruti', 'c21ydXRpMTIz', 'Smruti Ranjan Nayak', 'employee', 'Smruti Ranjan Nayak', 1);
