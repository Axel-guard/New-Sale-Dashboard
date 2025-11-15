-- Migration: Add module-level permissions
-- Date: 2025-11-15
-- Purpose: Add granular permissions for Sales, Inventory, Leads, and Reports modules

-- Add module-level permission columns
ALTER TABLE users ADD COLUMN sales_view INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN sales_edit INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN sales_delete INTEGER DEFAULT 0;

ALTER TABLE users ADD COLUMN inventory_view INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN inventory_edit INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN inventory_delete INTEGER DEFAULT 0;

ALTER TABLE users ADD COLUMN leads_view INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN leads_edit INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN leads_delete INTEGER DEFAULT 0;

ALTER TABLE users ADD COLUMN reports_view INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN reports_edit INTEGER DEFAULT 0;

-- Admin users get all module permissions
UPDATE users SET 
    sales_view = 1, sales_edit = 1, sales_delete = 1,
    inventory_view = 1, inventory_edit = 1, inventory_delete = 1,
    leads_view = 1, leads_edit = 1, leads_delete = 1,
    reports_view = 1, reports_edit = 1
WHERE role = 'admin';

-- Employee users start with view-only on all modules
UPDATE users SET 
    sales_view = 1, sales_edit = 0, sales_delete = 0,
    inventory_view = 1, inventory_edit = 0, inventory_delete = 0,
    leads_view = 1, leads_edit = 0, leads_delete = 0,
    reports_view = 1, reports_edit = 0
WHERE role = 'employee';

-- Create index for module permission lookups
CREATE INDEX IF NOT EXISTS idx_users_module_permissions ON users(username, sales_edit, inventory_edit, leads_edit);
