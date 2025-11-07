-- Add email column to users table
ALTER TABLE users ADD COLUMN email TEXT;

-- Create quotations table
CREATE TABLE IF NOT EXISTS quotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_number TEXT UNIQUE NOT NULL,
  customer_code TEXT,
  customer_name TEXT NOT NULL,
  customer_contact TEXT,
  customer_email TEXT,
  company_name TEXT,
  customer_address TEXT,
  concern_person_name TEXT,
  concern_person_contact TEXT,
  items TEXT NOT NULL, -- JSON string of items
  subtotal REAL DEFAULT 0,
  gst_amount REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  notes TEXT,
  terms_conditions TEXT,
  status TEXT DEFAULT 'draft', -- draft, sent, accepted, rejected
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME,
  sent_by TEXT
);

-- Create quotation_items table for individual items
CREATE TABLE IF NOT EXISTS quotation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_number TEXT NOT NULL,
  item_name TEXT NOT NULL,
  hsn_sac TEXT,
  quantity INTEGER DEFAULT 1,
  unit_price REAL DEFAULT 0,
  amount REAL DEFAULT 0,
  FOREIGN KEY (quotation_number) REFERENCES quotations(quotation_number)
);

-- Create email_log table to track sent emails
CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_number TEXT,
  recipient_email TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'sent', -- sent, failed, bounced
  error_message TEXT,
  FOREIGN KEY (quotation_number) REFERENCES quotations(quotation_number)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_code);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_created_at ON quotations(created_at);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON quotation_items(quotation_number);
CREATE INDEX IF NOT EXISTS idx_email_log_quotation ON email_log(quotation_number);
