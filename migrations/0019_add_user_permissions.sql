-- Migration: Add user permissions system
-- Date: 2025-11-15
-- Purpose: Add columns to users table for role-based access control

-- Add permissions columns to users table
ALTER TABLE users ADD COLUMN can_edit INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN can_delete INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN can_view INTEGER DEFAULT 1;

-- Admin users get all permissions by default
UPDATE users SET can_edit = 1, can_delete = 1, can_view = 1 WHERE role = 'admin';

-- Employee users start with view-only permissions (admin must grant edit rights)
UPDATE users SET can_edit = 0, can_delete = 0, can_view = 1 WHERE role = 'employee';

-- Create index for permission lookups
CREATE INDEX IF NOT EXISTS idx_users_permissions ON users(username, can_edit, can_delete);
