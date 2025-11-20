-- Create magic_links table for passwordless authentication
CREATE TABLE IF NOT EXISTS magic_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create index on token for fast lookups
CREATE INDEX IF NOT EXISTS idx_magic_links_token ON magic_links(token);

-- Create index on email for fast lookups
CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email);

-- Create index on expires_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_magic_links_expires ON magic_links(expires_at);
